export type ServerComponentStatus = 'ok' | 'error' | 'stale' | 'unknown';

export type ServerOverallStatus = 'OK' | 'DEGRADED' | 'DOWN';

export interface ServerComponentCheck {
  status: ServerComponentStatus;
  latencyMs: number | null;
  detail?: string | null;
}

export interface ServerWorkerCheck {
  status: ServerComponentStatus;
  ageMs: number | null;
  lastHeartbeatAt: string | null;
  buildVersion: string | null;
  required: boolean;
}

export interface ServerProcessSnapshot {
  uptimeSec: number;
  pid: number;
  nodeVersion: string;
  heapUsedMb: number;
  heapTotalMb: number;
  rssMb: number;
  externalMb: number;
  eventLoopLagMs: number;
}

export interface ServerQueueSnapshot {
  waitingJobs: number;
  activeJobs: number;
  delayedJobs: number;
  failedJobs: number;
  redisStatus: 'ok' | 'error' | 'unknown';
  workerConnected: boolean;
}

export interface ServerDiskSnapshot {
  mount: string;
  path: string;
  totalGb: number;
  freeGb: number;
  usedGb: number;
  usedPercent: number;
}

export interface ServerHostSnapshot {
  /** host = HOST_PROC mounted (real VPS); container = cgroup / local view */
  source: 'host' | 'container';
  hostname: string;
  platform: string;
  arch: string;
  uptimeSec: number;
  loadAvg: [number, number, number];
  cpuCount: number;
  cpuModel: string | null;
  memory: {
    totalMb: number;
    freeMb: number;
    usedMb: number;
    usedPercent: number;
  };
  swap: {
    totalMb: number;
    freeMb: number;
    usedMb: number;
  } | null;
  disks: ServerDiskSnapshot[];
  containerMemoryLimitMb: number | null;
}

export interface ServerHealthPack {
  overall: ServerOverallStatus;
  ready: boolean;
  checkedAt: string;
  buildVersion: string;
  gitCommit: string | null;
  appRole: string;
  database: ServerComponentCheck;
  redis: ServerComponentCheck;
  workers: ServerWorkerCheck;
  process: ServerProcessSnapshot;
  host: ServerHostSnapshot;
  queues: ServerQueueSnapshot | null;
  links: {
    systemHealth: string;
    queues: string;
    configurationHealth: string;
  };
}
