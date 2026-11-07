import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HELPER = path.join('scripts', 'test', 'assert-cardon-it-database.mjs');
const ALWAYS_FORBIDDEN = ['AppModule', 'WorkerModule', 'PrismaService', 'BullModule', 'NestFactory'];
const INTEGRATION_ONLY = ['new PrismaClient', 'queryInetServerAddr'];
const SKIP_DIRECTORIES = new Set(['node_modules', '.git']);

function normalize(filePath) {
  return filePath.split(path.sep).join('/');
}

export function isAllowedHelper(filePath) {
  return normalize(filePath).endsWith(normalize(HELPER));
}

export function findViolations(filePath, source) {
  const hits = [];
  for (const token of ALWAYS_FORBIDDEN) {
    if (source.includes(token)) hits.push(token);
  }
  if (!isAllowedHelper(filePath)) {
    for (const token of INTEGRATION_ONLY) {
      if (source.includes(token)) hits.push(token);
    }
  }
  return hits;
}

function listIntegrationFiles(root, fsImpl) {
  const directory = path.join(root, 'test', 'integration');
  if (!fsImpl.existsSync(directory)) return { files: [], violations: [] };
  const files = [];
  const violations = [];
  const stack = [directory];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = fsImpl.readdirSync(current, { withFileTypes: true });
    } catch {
      violations.push({
        file: normalize(path.relative(root, current)),
        token: 'unreadable-directory',
      });
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name)) continue;
        stack.push(path.join(current, entry.name));
        continue;
      }
      if (entry.isFile()) files.push(path.join(current, entry.name));
    }
  }
  return { files, violations };
}

export function scanRepo(root = repoRoot, fsImpl = fs) {
  const listed = listIntegrationFiles(root, fsImpl);
  const files = [path.join(root, HELPER), ...listed.files];
  const violations = [...listed.violations];
  for (const filePath of files) {
    if (!fsImpl.existsSync(filePath)) continue;
    let source;
    try {
      source = fsImpl.readFileSync(filePath, 'utf8');
    } catch {
      violations.push({
        file: normalize(path.relative(root, filePath)),
        token: 'unreadable-file',
      });
      continue;
    }
    for (const token of findViolations(filePath, source)) {
      violations.push({ file: normalize(path.relative(root, filePath)), token });
    }
  }
  return violations;
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  return pathToFileURL(path.resolve(entry)).href === import.meta.url;
}

if (invokedDirectly()) {
  const violations = scanRepo();
  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(`${violation.file}: ${violation.token}`);
    }
    process.exit(1);
  }
}
