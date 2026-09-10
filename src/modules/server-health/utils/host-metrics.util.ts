import { existsSync, readFileSync, statfsSync } from 'fs';
import * as os from 'os';
import { join } from 'path';
import type { ServerDiskSnapshot, ServerHostSnapshot } from '../entities/server-health.types';

const MB = 1024 * 1024;
const GB = 1024 * 1024 * 1024;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function readText(path: string): string | null {
  try {
    if (!existsSync(path)) return null;
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function parseMeminfo(raw: string): {
  totalKb: number;
  availableKb: number;
  swapTotalKb: number;
  swapFreeKb: number;
} | null {
  const map = new Map<string, number>();
  for (const line of raw.split('\n')) {
    const m = /^(\w+):\s+(\d+)/.exec(line);
    if (m) map.set(m[1], Number(m[2]));
  }
  const totalKb = map.get('MemTotal');
  if (totalKb == null || totalKb <= 0) return null;
  const availableKb = map.get('MemAvailable') ?? map.get('MemFree') ?? 0;
  return {
    totalKb,
    availableKb,
    swapTotalKb: map.get('SwapTotal') ?? 0,
    swapFreeKb: map.get('SwapFree') ?? 0,
  };
}

function parseLoadavg(raw: string): [number, number, number] | null {
  const parts = raw.trim().split(/\s+/);
  if (parts.length < 3) return null;
  const a = Number(parts[0]);
  const b = Number(parts[1]);
  const c = Number(parts[2]);
  if (![a, b, c].every((n) => Number.isFinite(n))) return null;
  return [a, b, c];
}

function parseUptimeSec(raw: string): number | null {
  const first = Number(raw.trim().split(/\s+/)[0]);
  return Number.isFinite(first) && first >= 0 ? Math.floor(first) : null;
}

function diskAt(path: string, mountLabel: string): ServerDiskSnapshot | null {
  try {
    const s = statfsSync(path);
    const total = Number(s.blocks) * Number(s.bsize);
    const free = Number(s.bavail) * Number(s.bsize);
    if (!Number.isFinite(total) || total <= 0) return null;
    const used = Math.max(0, total - free);
    return {
      mount: mountLabel,
      path,
      totalGb: round1(total / GB),
      freeGb: round1(free / GB),
      usedGb: round1(used / GB),
      usedPercent: Math.round((used / total) * 1000) / 10,
    };
  } catch {
    return null;
  }
}

function readCgroupMemoryLimitMb(): number | null {
  const candidates = [
    '/sys/fs/cgroup/memory.max',
    '/sys/fs/cgroup/memory/memory.limit_in_bytes',
  ];
  for (const path of candidates) {
    const raw = readText(path)?.trim();
    if (!raw || raw === 'max') continue;
    const bytes = Number(raw);
    if (!Number.isFinite(bytes) || bytes <= 0 || bytes >= 1e15) continue;
    return round1(bytes / MB);
  }
  return null;
}

/**
 * Collect host / VPS metrics. Prefer HOST_PROC (/host/proc) when mounted
 * so container mem_limit does not mask real VPS RAM.
 */
export function snapshotHostMetrics(): ServerHostSnapshot {
  const hostProc = (process.env.HOST_PROC ?? '').trim().replace(/\/$/, '');
  const hostRoot = (process.env.HOST_ROOT ?? '').trim().replace(/\/$/, '');
  const usingHostProc = Boolean(hostProc && existsSync(join(hostProc, 'meminfo')));

  const meminfoRaw = usingHostProc
    ? readText(join(hostProc, 'meminfo'))
    : readText('/proc/meminfo');
  const parsed = meminfoRaw ? parseMeminfo(meminfoRaw) : null;

  let memoryTotalMb: number;
  let memoryFreeMb: number;
  let memorySource: 'host' | 'container' = usingHostProc ? 'host' : 'container';

  if (parsed) {
    memoryTotalMb = round1((parsed.totalKb * 1024) / MB);
    memoryFreeMb = round1((parsed.availableKb * 1024) / MB);
    if (!usingHostProc && process.env.HOST_PROC) {
      memorySource = 'container';
    } else if (usingHostProc) {
      memorySource = 'host';
    } else {
      // /proc/meminfo inside Docker with mem_limit often reflects cgroup
      const limit = readCgroupMemoryLimitMb();
      if (limit != null && memoryTotalMb <= limit * 1.05) {
        memorySource = 'container';
      }
    }
  } else {
    memoryTotalMb = round1(os.totalmem() / MB);
    memoryFreeMb = round1(os.freemem() / MB);
    memorySource = 'container';
  }

  const memoryUsedMb = round1(Math.max(0, memoryTotalMb - memoryFreeMb));
  const memoryUsedPercent =
    memoryTotalMb > 0 ? Math.round((memoryUsedMb / memoryTotalMb) * 1000) / 10 : 0;

  let swap: ServerHostSnapshot['swap'] = null;
  if (parsed && parsed.swapTotalKb > 0) {
    const swapTotalMb = round1((parsed.swapTotalKb * 1024) / MB);
    const swapFreeMb = round1((parsed.swapFreeKb * 1024) / MB);
    swap = {
      totalMb: swapTotalMb,
      freeMb: swapFreeMb,
      usedMb: round1(Math.max(0, swapTotalMb - swapFreeMb)),
    };
  }

  const loadRaw = usingHostProc
    ? readText(join(hostProc, 'loadavg'))
    : readText('/proc/loadavg');
  const loadParsed = loadRaw ? parseLoadavg(loadRaw) : null;
  const loadAvg = loadParsed ?? (os.loadavg() as [number, number, number]);

  const uptimeRaw = usingHostProc
    ? readText(join(hostProc, 'uptime'))
    : readText('/proc/uptime');
  const uptimeSec = parseUptimeSec(uptimeRaw ?? '') ?? Math.floor(os.uptime());

  const cpus = os.cpus();
  const disks: ServerDiskSnapshot[] = [];
  const rootPath = hostRoot && existsSync(hostRoot) ? hostRoot : '/';
  const rootDisk = diskAt(rootPath, hostRoot ? 'host:/' : '/');
  if (rootDisk) disks.push(rootDisk);

  const uploadsDisk = diskAt('/app/uploads', '/app/uploads');
  if (
    uploadsDisk &&
    (!rootDisk ||
      uploadsDisk.totalGb !== rootDisk.totalGb ||
      uploadsDisk.freeGb !== rootDisk.freeGb)
  ) {
    disks.push(uploadsDisk);
  }

  return {
    source: memorySource,
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    uptimeSec,
    loadAvg: [
      Math.round(loadAvg[0] * 100) / 100,
      Math.round(loadAvg[1] * 100) / 100,
      Math.round(loadAvg[2] * 100) / 100,
    ],
    cpuCount: cpus.length || os.availableParallelism?.() || 1,
    cpuModel: cpus[0]?.model?.trim() || null,
    memory: {
      totalMb: memoryTotalMb,
      freeMb: memoryFreeMb,
      usedMb: memoryUsedMb,
      usedPercent: memoryUsedPercent,
    },
    swap,
    disks,
    containerMemoryLimitMb: readCgroupMemoryLimitMb(),
  };
}
