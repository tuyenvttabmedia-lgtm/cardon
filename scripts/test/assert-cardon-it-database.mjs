import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scanRepo } from './scan-integration-imports.mjs';

const SUPPORTED_MODES = new Set(['connect', 'migrate', 'run']);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEST_CONTAINER_NAME = 'cardon-it-postgres';

export class GuardError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GuardError';
  }
}

export function readTestDatabaseUrl(env) {
  const value = env?.CARDON_IT_DATABASE_URL;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new GuardError('CARDON_IT_DATABASE_URL is required');
  }
  return value.trim();
}

export function parseCardonItUrl(raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new GuardError('CARDON_IT_DATABASE_URL is not a valid URL');
  }

  const protocol = parsed.protocol.replace(':', '');
  if (protocol !== 'postgresql' && protocol !== 'postgres') {
    throw new GuardError('CARDON_IT_DATABASE_URL must use the postgresql scheme');
  }
  if (parsed.hostname !== '127.0.0.1') {
    throw new GuardError('CARDON_IT_DATABASE_URL host must be 127.0.0.1');
  }
  if (parsed.port !== '5434') {
    throw new GuardError('CARDON_IT_DATABASE_URL port is not allowed');
  }

  const parts = parsed.pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part));
  if (parts.length !== 1 || parts[0] !== 'cardon_it') {
    throw new GuardError('CARDON_IT_DATABASE_URL database must be cardon_it');
  }

  return {
    href: parsed.href,
    hostname: parsed.hostname,
    port: parsed.port,
    database: parts[0],
  };
}

export function prismaCliEntry(root = repoRoot) {
  return path.join(root, 'node_modules', 'prisma', 'build', 'index.js');
}

export function buildPrismaChildEnv(baseEnv, guardedHref) {
  const env = { ...baseEnv };
  for (const key of Object.keys(env)) {
    const normalized = key.toLowerCase();
    if (
      normalized === 'database_url' ||
      normalized === 'shadow_database_url' ||
      normalized === 'redis_url' ||
      normalized === 'web_internal_url' ||
      normalized === 'web_revalidate_secret'
    ) {
      delete env[key];
    }
  }
  env.DATABASE_URL = guardedHref;
  return env;
}

export function buildJestChildEnv(baseEnv, guardedHref) {
  const checked = parseCardonItUrl(guardedHref);
  const env = { ...baseEnv };
  for (const key of Object.keys(env)) {
    const normalized = key.toLowerCase();
    if (
      normalized === 'database_url' ||
      normalized === 'shadow_database_url' ||
      normalized === 'cardon_it_database_url' ||
      normalized === 'redis_url' ||
      normalized === 'web_internal_url' ||
      normalized === 'web_revalidate_secret'
    ) {
      delete env[key];
    }
  }
  env.CARDON_IT_DATABASE_URL = checked.href;
  // Prisma Client loads the repo .env and adopts DATABASE_URL when the variable is absent.
  env.DATABASE_URL = '';
  env.SHADOW_DATABASE_URL = '';
  return env;
}

export function normalizeAddr(value) {
  return String(value ?? '')
    .trim()
    .replace(/\/\d+$/, '');
}

export function readProbeRow(rows) {
  const row = Array.isArray(rows) ? rows[0] : rows;
  const addr = row?.addr;
  const database = row?.database;
  if (typeof addr !== 'string' || addr.trim() === '') {
    throw new GuardError('Database server address is missing');
  }
  if (typeof database !== 'string' || database.trim() === '') {
    throw new GuardError('Database name is missing');
  }
  return { addr: addr.trim(), database: database.trim() };
}

export function assertProbeIdentity(probe, containerIp) {
  const identity = readProbeRow(probe);
  if (identity.database !== 'cardon_it') {
    throw new GuardError('Database name is not cardon_it');
  }
  if (normalizeAddr(identity.addr) !== normalizeAddr(containerIp)) {
    throw new GuardError('Database server address does not match the test container IP');
  }
  return identity;
}

export async function assertCardonItTarget(deps) {
  const parsed = parseCardonItUrl(readTestDatabaseUrl(deps.env ?? {}));
  const identity = await deps.inspectContainer();
  const containerId = String(identity?.containerId ?? '').trim();
  const containerIp = String(identity?.containerIp ?? '').trim();
  if (!containerId || !containerIp) {
    throw new GuardError('Test container id or IP is not verified');
  }
  let probe;
  try {
    probe = await deps.queryServerAddr(parsed.href);
  } catch (error) {
    if (error instanceof GuardError) throw error;
    throw new GuardError('Database probe failed');
  }
  assertProbeIdentity(probe, containerIp);
  return parsed;
}

export async function runGuardedMigrate(deps) {
  const parsed = await assertCardonItTarget(deps);
  const env = buildPrismaChildEnv(deps.env ?? {}, parsed.href);
  const status = deps.spawn(process.execPath, [prismaCliEntry(deps.repoRoot ?? repoRoot), 'migrate', 'deploy'], {
    env,
    cwd: deps.repoRoot ?? repoRoot,
  });
  const code = typeof status === 'number' ? status : status?.status;
  if (code !== 0) {
    throw new GuardError('prisma migrate deploy failed');
  }
  return { env, parsed };
}

export async function createExplicitPrismaFactory() {
  const { PrismaClient } = await import('@prisma/client');
  return (options) => {
    const url = options?.datasources?.db?.url;
    if (typeof url !== 'string' || url.trim() === '') {
      throw new GuardError('Prisma client requires an explicit datasources.db.url');
    }
    return new PrismaClient({
      datasources: { db: { url } },
    });
  };
}

export const SERVER_IDENTITY_SQL =
  'SELECT host(inet_server_addr()) AS addr, current_database() AS database';

export async function probeWithClient(client) {
  try {
    const rows = await client.$queryRawUnsafe(SERVER_IDENTITY_SQL);
    return readProbeRow(rows);
  } finally {
    if (typeof client.$disconnect === 'function') {
      await client.$disconnect();
    }
  }
}

export async function queryInetServerAddr(href) {
  const factory = await createExplicitPrismaFactory();
  const client = factory({ datasources: { db: { url: href } } });
  return probeWithClient(client);
}

export function resolveMode(argv) {
  const flags = (argv ?? []).filter((arg) => String(arg).startsWith('--'));
  const unknown = flags.filter((flag) => !SUPPORTED_MODES.has(flag.slice(2)));
  if (unknown.length > 0) {
    throw new GuardError('Unsupported runner flag');
  }
  if (flags.length > 1) {
    throw new GuardError('Runner modes cannot be combined');
  }
  return flags.length === 1 ? flags[0].slice(2) : 'static';
}

export function runStaticPreflight(deps) {
  const parsed = parseCardonItUrl(readTestDatabaseUrl(deps.env ?? {}));
  const scan = deps.scanRepo ?? scanRepo;
  const violations = scan(deps.repoRoot ?? repoRoot);
  if (violations.length > 0) {
    throw new GuardError('Integration import scan failed');
  }
  return { mode: 'static', parsed, violations };
}

export function runIntegration(deps) {
  const preflight = runStaticPreflight(deps);
  const status = deps.spawnJest(
    process.execPath,
    [path.join(deps.repoRoot ?? repoRoot, 'node_modules', 'jest', 'bin', 'jest.js'), '--config', 'jest.integration.config.js', '--runInBand'],
    {
      env: buildJestChildEnv(deps.env ?? {}, preflight.parsed.href),
      cwd: deps.repoRoot ?? repoRoot,
    },
  );
  const code = typeof status === 'number' ? status : status?.status;
  if (code !== 0) {
    throw new GuardError('Integration Jest failed');
  }
  return { ...preflight, mode: 'run' };
}

export async function dispatchRunner(deps) {
  const mode = resolveMode(deps.argv ?? []);
  if (mode === 'static') {
    return runStaticPreflight(deps);
  }
  if (mode === 'connect') {
    const parsed = await assertCardonItTarget(deps);
    return { mode, parsed };
  }
  if (mode === 'migrate') {
    const result = await runGuardedMigrate(deps);
    return { mode, ...result };
  }
  return runIntegration(deps);
}

export function inspectNamedContainer(spawnSyncImpl = spawnSync) {
  const result = spawnSyncImpl(
    'docker',
    [
      'inspect',
      '-f',
      '{{.Id}}|{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}',
      TEST_CONTAINER_NAME,
    ],
    { encoding: 'utf8' },
  );
  if (!result || result.status !== 0) {
    return { containerId: '', containerIp: '' };
  }
  const [containerId = '', ipField = ''] = String(result.stdout ?? '').trim().split('|');
  const containerIp = ipField.trim().split(/\s+/).find(Boolean) ?? '';
  return { containerId: containerId.trim(), containerIp };
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  return pathToFileURL(path.resolve(entry)).href === import.meta.url;
}

async function main() {
  const mode = resolveMode(process.argv.slice(2));
  if (mode === 'static') {
    const result = runStaticPreflight({ env: process.env, repoRoot, scanRepo });
    if (result.violations.length > 0) {
      throw new GuardError('Integration import scan failed');
    }
    return;
  }
  if (mode === 'connect') {
    await assertCardonItTarget({
      env: process.env,
      inspectContainer: async () => inspectNamedContainer(),
      queryServerAddr: (href) => queryInetServerAddr(href),
    });
    return;
  }
  if (mode === 'migrate') {
    await runGuardedMigrate({
      env: process.env,
      repoRoot,
      inspectContainer: async () => inspectNamedContainer(),
      queryServerAddr: (href) => queryInetServerAddr(href),
      spawn: (execPath, args, options) => spawnSync(execPath, args, { ...options, stdio: 'inherit' }),
    });
    return;
  }
  runIntegration({
    env: process.env,
    repoRoot,
    scanRepo,
    spawnJest: (execPath, args, options) => spawnSync(execPath, args, { ...options, stdio: 'inherit' }),
  });
}

if (invokedDirectly()) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : 'Integration guard failed';
    console.error(message);
    process.exit(1);
  });
}
