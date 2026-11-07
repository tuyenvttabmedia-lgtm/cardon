import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {
  GuardError,
  SERVER_IDENTITY_SQL,
  assertCardonItTarget,
  assertProbeIdentity,
  buildJestChildEnv,
  buildPrismaChildEnv,
  dispatchRunner,
  parseCardonItUrl,
  prismaCliEntry,
  probeWithClient,
  readProbeRow,
  readTestDatabaseUrl,
  resolveMode,
  runGuardedMigrate,
} from './assert-cardon-it-database.mjs';
import { findViolations, scanRepo } from './scan-integration-imports.mjs';

const SAFE_URL = 'postgresql://cardon_it:secret@127.0.0.1:5434/cardon_it?schema=public';
const SHARED_URL = 'postgresql://cardon:secret@127.0.0.1:5433/cardon?schema=public';

function tap(impl) {
  const fn = (...args) => {
    fn.calls.push(args);
    return impl?.(...args);
  };
  fn.calls = [];
  return fn;
}

function sideEffects(overrides = {}) {
  return {
    factory: tap(() => ({ id: 'mock-client' })),
    spawn: tap(() => 0),
    spawnJest: tap(() => 0),
    write: tap(),
    inspectContainer: tap(async () => overrides.identity ?? { containerId: 'cid-test', containerIp: '172.16.0.8' }),
    queryServerAddr: tap(async () => overrides.probe ?? {
      addr: overrides.serverAddr ?? '172.16.0.8',
      database: overrides.database ?? 'cardon_it',
    }),
  };
}

function envWith(url) {
  return {
    CARDON_IT_DATABASE_URL: url,
    DATABASE_URL: SHARED_URL,
    REDIS_URL: 'redis://redis:6379',
    WEB_INTERNAL_URL: 'http://web:3001',
    WEB_REVALIDATE_SECRET: 'local-secret',
    PATH: 'C:\\Windows\\system32',
  };
}

async function expectNoSideEffects(run, effects) {
  await assert.rejects(run, GuardError);
  assert.equal(effects.factory.calls.length, 0);
  assert.equal(effects.spawn.calls.length, 0);
  assert.equal(effects.write.calls.length, 0);
}

test('rejects a missing test database variable without reading DATABASE_URL', async () => {
  const effects = sideEffects();
  await expectNoSideEffects(
    () => runGuardedMigrate({ env: { DATABASE_URL: SHARED_URL }, repoRoot: 'C:\\repo', ...effects }),
    effects,
  );
  assert.equal(effects.queryServerAddr.calls.length, 0);
  assert.throws(() => readTestDatabaseUrl({ DATABASE_URL: SHARED_URL }), GuardError);
});

test('rejects an unparseable URL', async () => {
  const effects = sideEffects();
  await expectNoSideEffects(
    () => runGuardedMigrate({ env: envWith('not a url'), repoRoot: 'C:\\repo', ...effects }),
    effects,
  );
  assert.equal(effects.queryServerAddr.calls.length, 0);
});

test('rejects a database other than cardon_it', async () => {
  const effects = sideEffects();
  await expectNoSideEffects(
    () =>
      runGuardedMigrate({
        env: envWith('postgresql://cardon_it:secret@127.0.0.1:5434/cardon?schema=public'),
        repoRoot: 'C:\\repo',
        ...effects,
      }),
    effects,
  );
});

test('rejects a host other than 127.0.0.1', async () => {
  const effects = sideEffects();
  await expectNoSideEffects(
    () =>
      runGuardedMigrate({
        env: envWith('postgresql://cardon_it:secret@localhost:5434/cardon_it'),
        repoRoot: 'C:\\repo',
        ...effects,
      }),
    effects,
  );
});

test('rejects ports 5432 and 5433', async () => {
  for (const port of ['5432', '5433']) {
    const effects = sideEffects();
    await expectNoSideEffects(
      () =>
        runGuardedMigrate({
          env: envWith(`postgresql://cardon_it:secret@127.0.0.1:${port}/cardon_it`),
          repoRoot: 'C:\\repo',
          ...effects,
        }),
      effects,
    );
  }
});

test('accepts only 127.0.0.1 port 5434 database cardon_it', () => {
  const parsed = parseCardonItUrl(SAFE_URL);
  assert.equal(parsed.hostname, '127.0.0.1');
  assert.equal(parsed.port, '5434');
  assert.equal(parsed.database, 'cardon_it');
  const postgresScheme = parseCardonItUrl('postgres://cardon_it:secret@127.0.0.1:5434/cardon_it');
  assert.equal(postgresScheme.hostname, '127.0.0.1');
  assert.equal(postgresScheme.port, '5434');
  assert.equal(postgresScheme.database, 'cardon_it');
});

test('rejects URLs that are not the isolated cardon_it endpoint', () => {
  const cases = [
    ['postgresql://cardon_it:secret@127.0.0.1/cardon_it', 'CARDON_IT_DATABASE_URL port is not allowed'],
    ['postgresql://cardon_it:secret@127.0.0.1:5432/cardon_it', 'CARDON_IT_DATABASE_URL port is not allowed'],
    ['postgresql://cardon_it:secret@127.0.0.1:5433/cardon_it', 'CARDON_IT_DATABASE_URL port is not allowed'],
    ['postgresql://cardon_it:secret@127.0.0.1:5435/cardon_it', 'CARDON_IT_DATABASE_URL port is not allowed'],
    ['postgresql://cardon_it:secret@localhost:5434/cardon_it', 'CARDON_IT_DATABASE_URL host must be 127.0.0.1'],
    ['postgresql://cardon_it:secret@10.0.0.8:5434/cardon_it', 'CARDON_IT_DATABASE_URL host must be 127.0.0.1'],
    ['postgresql://cardon_it:secret@127.0.0.1:5434/cardon', 'CARDON_IT_DATABASE_URL database must be cardon_it'],
    ['mysql://cardon_it:secret@127.0.0.1:5434/cardon_it', 'CARDON_IT_DATABASE_URL must use the postgresql scheme'],
  ];
  for (const [url, message] of cases) {
    assert.throws(() => parseCardonItUrl(url), (error) => {
      assert.equal(error instanceof GuardError, true);
      assert.equal(error.message, message);
      assert.equal(error.message.includes('secret'), false);
      assert.equal(error.message.includes('postgresql://'), false);
      assert.equal(error.message.includes('mysql://'), false);
      return true;
    });
  }
});

test('missing CARDON_IT_DATABASE_URL is rejected even when DATABASE_URL is set', () => {
  assert.throws(() => readTestDatabaseUrl({ DATABASE_URL: SHARED_URL }), (error) => {
    assert.equal(error instanceof GuardError, true);
    assert.equal(error.message, 'CARDON_IT_DATABASE_URL is required');
    assert.equal(error.message.includes('postgresql://'), false);
    return true;
  });
  assert.throws(() => readTestDatabaseUrl({}), GuardError);
  assert.throws(() => parseCardonItUrl(''), (error) => {
    assert.equal(error instanceof GuardError, true);
    assert.equal(error.message, 'CARDON_IT_DATABASE_URL is not a valid URL');
    return true;
  });
});

test('connect and run reject a non-isolated URL before any connector or Jest', async () => {
  const badUrls = [
    'postgresql://cardon_it:secret@127.0.0.1/cardon_it',
    'postgresql://cardon_it:secret@127.0.0.1:5432/cardon_it',
    'postgresql://cardon_it:secret@127.0.0.1:5433/cardon_it',
    'postgresql://cardon_it:secret@127.0.0.1:5435/cardon_it',
    'postgresql://cardon_it:secret@localhost:5434/cardon_it',
    'postgresql://cardon_it:secret@10.0.0.8:5434/cardon_it',
    'postgresql://cardon_it:secret@127.0.0.1:5434/cardon',
    'mysql://cardon_it:secret@127.0.0.1:5434/cardon_it',
  ];
  for (const url of badUrls) {
    for (const flag of ['--connect', '--run']) {
      const effects = sideEffects();
      const scan = tap(() => []);
      await assert.rejects(
        () => dispatchRunner({
          argv: [flag],
          env: envWith(url),
          repoRoot: 'C:\\repo',
          scanRepo: scan,
          ...effects,
        }),
        (error) => {
          assert.equal(error instanceof GuardError, true);
          assert.equal(error.message.includes('secret'), false);
          assert.equal(error.message.includes('postgresql://'), false);
          return true;
        },
      );
      assert.equal(scan.calls.length, 0);
      assert.equal(effects.inspectContainer.calls.length, 0);
      assert.equal(effects.queryServerAddr.calls.length, 0);
      assert.equal(effects.factory.calls.length, 0);
      assert.equal(effects.spawn.calls.length, 0);
      assert.equal(effects.spawnJest.calls.length, 0);
      assert.equal(effects.write.calls.length, 0);
    }
  }

  for (const flag of ['--connect', '--run']) {
    const effects = sideEffects();
    const scan = tap(() => []);
    await assert.rejects(
      () => dispatchRunner({
        argv: [flag],
        env: { DATABASE_URL: SHARED_URL },
        repoRoot: 'C:\\repo',
        scanRepo: scan,
        ...effects,
      }),
      (error) => {
        assert.equal(error instanceof GuardError, true);
        assert.equal(error.message, 'CARDON_IT_DATABASE_URL is required');
        return true;
      },
    );
    assert.equal(scan.calls.length, 0);
    assert.equal(effects.inspectContainer.calls.length, 0);
    assert.equal(effects.queryServerAddr.calls.length, 0);
    assert.equal(effects.spawnJest.calls.length, 0);
  }
});

test('rejects an unverified container before querying the server', async () => {
  const effects = sideEffects({ identity: { containerId: '', containerIp: '' } });
  await expectNoSideEffects(
    () => runGuardedMigrate({ env: envWith(SAFE_URL), repoRoot: 'C:\\repo', ...effects }),
    effects,
  );
  assert.equal(effects.queryServerAddr.calls.length, 0);
});

test('rejects a server address that does not match the container IP', async () => {
  const effects = sideEffects({ serverAddr: '10.0.0.4' });
  await expectNoSideEffects(
    () => runGuardedMigrate({ env: envWith(SAFE_URL), repoRoot: 'C:\\repo', ...effects }),
    effects,
  );
  assert.equal(effects.queryServerAddr.calls.length, 1);
});

test('uses the guarded URL and does not keep the inherited database URL', async () => {
  const effects = sideEffects();
  const repoRoot = 'C:\\repo';
  const result = await runGuardedMigrate({
    env: envWith(SAFE_URL),
    repoRoot,
    ...effects,
  });

  assert.equal(effects.factory.calls.length, 0);
  assert.equal(effects.queryServerAddr.calls.length, 1);
  assert.equal(effects.queryServerAddr.calls[0][0], result.parsed.href);
  assert.notEqual(effects.queryServerAddr.calls[0][0], SHARED_URL);
  assert.notEqual(result.parsed.href, SHARED_URL);
  assert.equal(result.env.DATABASE_URL, result.parsed.href);
  assert.equal(result.env.REDIS_URL, undefined);
  assert.equal(result.env.WEB_INTERNAL_URL, undefined);
  assert.equal(result.env.WEB_REVALIDATE_SECRET, undefined);
  assert.equal(effects.spawn.calls.length, 1);
  assert.equal(effects.spawn.calls[0][1][1], 'migrate');
  assert.equal(effects.spawn.calls[0][1][2], 'deploy');
  assert.equal(effects.spawn.calls[0][1].includes('dev'), false);
  assert.equal(effects.spawn.calls[0][1][0], prismaCliEntry(repoRoot));
  assert.equal(effects.spawn.calls[0][2].env.DATABASE_URL, result.parsed.href);
  assert.equal(effects.write.calls.length, 0);
  assert.match(effects.spawn.calls[0][1][0], /node_modules[\\/]prisma[\\/]build[\\/]index\.js$/);
});

test('does not call the write hook when migrate deploy fails', async () => {
  const effects = sideEffects();
  effects.spawn = tap(() => 1);
  await assert.rejects(
    () => runGuardedMigrate({ env: envWith(SAFE_URL), repoRoot: 'C:\\repo', ...effects }),
    GuardError,
  );
  assert.equal(effects.factory.calls.length, 0);
  assert.equal(effects.spawn.calls.length, 1);
  assert.equal(effects.write.calls.length, 0);
});

test('strips revalidation and Redis variables from the Jest environment', () => {
  const checked = parseCardonItUrl(SAFE_URL);
  const env = buildJestChildEnv(
    {
      ...envWith(SAFE_URL),
      Database_Url: SHARED_URL,
      SHADOW_DATABASE_URL: SHARED_URL,
    },
    SAFE_URL,
  );
  assert.equal(env.REDIS_URL, undefined);
  assert.equal(env.WEB_INTERNAL_URL, undefined);
  assert.equal(env.WEB_REVALIDATE_SECRET, undefined);
  assert.equal(env.Database_Url, undefined);
  assert.equal(env.CARDON_IT_DATABASE_URL, checked.href);
  assert.equal(env.DATABASE_URL, '');
  assert.equal(env.SHADOW_DATABASE_URL, '');
  assert.equal(Object.values(env).includes(SHARED_URL), false);
  assert.equal(env.PATH, 'C:\\Windows\\system32');
});

test('Jest environment rejects an unchecked database URL', () => {
  assert.throws(() => buildJestChildEnv(envWith(SAFE_URL), SHARED_URL), GuardError);
});

test('parser error text does not include the connection secret', () => {
  assert.throws(() => parseCardonItUrl('postgresql://user:secret@localhost:5434/cardon_it'), (error) => {
    assert.equal(error instanceof GuardError, true);
    assert.equal(String(error.message).includes('secret'), false);
    return true;
  });
});

test('scanner rejects forbidden imports outside the helper and accepts the current tree', () => {
  const violations = findViolations('test/integration/example.it.ts', 'import { AppModule } from "./app"; new PrismaClient()');
  assert.deepEqual(violations, ['AppModule', 'new PrismaClient']);
  assert.deepEqual(findViolations('scripts/test/assert-cardon-it-database.mjs', 'return new PrismaClient(options);'), []);
  assert.deepEqual(
    findViolations('test/integration/example.it.ts', 'await queryInetServerAddr(url)'),
    ['queryInetServerAddr'],
  );
  assert.deepEqual(
    findViolations('scripts/test/assert-cardon-it-database.mjs', 'export async function queryInetServerAddr(href) {}'),
    [],
  );
  assert.deepEqual(scanRepo(), []);
});

test('scanner reads nested integration files, skips node_modules, and reports unreadable paths', () => {
  const root = path.resolve('C:/repo');
  const integration = path.join(root, 'test', 'integration');
  const nested = path.join(integration, 'nested');
  const modulesDir = path.join(integration, 'node_modules');
  const hidden = path.join(nested, 'hidden.it.ts');
  const ignored = path.join(modulesDir, 'secret.it.ts');
  const helper = path.join(root, 'scripts', 'test', 'assert-cardon-it-database.mjs');
  const locked = path.join(integration, 'locked.it.ts');
  const tree = new Map([
    [integration, [
      { name: 'nested', isDirectory: () => true, isFile: () => false },
      { name: 'node_modules', isDirectory: () => true, isFile: () => false },
      { name: 'locked.it.ts', isDirectory: () => false, isFile: () => true },
    ]],
    [nested, [{ name: 'hidden.it.ts', isDirectory: () => false, isFile: () => true }]],
    [modulesDir, [{ name: 'secret.it.ts', isDirectory: () => false, isFile: () => true }]],
  ]);
  const fsImpl = {
    existsSync: (file) => file === helper || file === integration || file === hidden || file === locked,
    readdirSync: (dir) => {
      if (!tree.has(dir)) throw new Error('EACCES');
      return tree.get(dir);
    },
    readFileSync: (file) => {
      if (file === hidden) return 'await queryInetServerAddr(url)';
      if (file === ignored) return 'new PrismaClient()';
      if (file === locked) throw new Error('EACCES');
      return '';
    },
  };
  const violations = scanRepo(root, fsImpl);
  assert.deepEqual(violations, [
    { file: 'test/integration/locked.it.ts', token: 'unreadable-file' },
    { file: 'test/integration/nested/hidden.it.ts', token: 'queryInetServerAddr' },
  ]);

  const blockedRoot = path.resolve('C:/blocked');
  const blockedIntegration = path.join(blockedRoot, 'test', 'integration');
  const blocked = scanRepo(blockedRoot, {
    existsSync: (file) => file === blockedIntegration,
    readdirSync: () => {
      throw new Error('EACCES');
    },
    readFileSync: () => '',
  });
  assert.deepEqual(blocked, [
    { file: 'test/integration', token: 'unreadable-directory' },
  ]);
});

test('child database env replaces an inherited URL', () => {
  const parsed = parseCardonItUrl(SAFE_URL);
  const env = buildPrismaChildEnv(envWith(SAFE_URL), parsed.href);
  assert.equal(env.DATABASE_URL, parsed.href);
  assert.equal(Object.values(env).includes(SHARED_URL), false);
});

test('preflight does not create a client when the container IP does not match', async () => {
  const effects = sideEffects({ serverAddr: '10.9.9.9' });
  await assert.rejects(
    () => assertCardonItTarget({ env: envWith(SAFE_URL), ...effects }),
    GuardError,
  );
  assert.equal(effects.factory.calls.length, 0);
  assert.equal(effects.spawn.calls.length, 0);
  assert.equal(effects.write.calls.length, 0);
});

test('default mode only parses the URL and scans imports', async () => {
  const effects = sideEffects();
  const scan = tap(() => []);
  const result = await dispatchRunner({
    argv: [],
    env: envWith(SAFE_URL),
    repoRoot: 'C:\\repo',
    scanRepo: scan,
    ...effects,
  });
  assert.equal(result.mode, 'static');
  assert.equal(result.parsed.database, 'cardon_it');
  assert.equal(scan.calls.length, 1);
  assert.equal(effects.inspectContainer.calls.length, 0);
  assert.equal(effects.queryServerAddr.calls.length, 0);
  assert.equal(effects.factory.calls.length, 0);
  assert.equal(effects.spawn.calls.length, 0);
  assert.equal(effects.spawnJest.calls.length, 0);
  assert.equal(effects.write.calls.length, 0);
});

test('default mode rejects a bad URL before any side effect', async () => {
  const effects = sideEffects();
  const scan = tap(() => []);
  await assert.rejects(
    () => dispatchRunner({ argv: [], env: { DATABASE_URL: SHARED_URL }, repoRoot: 'C:\\repo', scanRepo: scan, ...effects }),
    GuardError,
  );
  assert.equal(scan.calls.length, 0);
  assert.equal(effects.inspectContainer.calls.length, 0);
  assert.equal(effects.queryServerAddr.calls.length, 0);
  assert.equal(effects.factory.calls.length, 0);
  assert.equal(effects.spawn.calls.length, 0);
  assert.equal(effects.spawnJest.calls.length, 0);
});

test('connect mode probes only after the container identity is present', async () => {
  const effects = sideEffects();
  const result = await dispatchRunner({ argv: ['--connect'], env: envWith(SAFE_URL), ...effects });
  assert.equal(result.mode, 'connect');
  assert.equal(effects.queryServerAddr.calls.length, 1);
  assert.equal(effects.factory.calls.length, 0);
  assert.equal(effects.spawn.calls.length, 0);
  assert.equal(effects.spawnJest.calls.length, 0);
});

test('does not spawn Jest when the import scan fails', async () => {
  const effects = sideEffects();
  const scan = tap(() => [{ file: 'test/integration/example.it.ts', token: 'queryInetServerAddr' }]);
  await assert.rejects(
    () =>
      dispatchRunner({
        argv: ['--run'],
        env: envWith(SAFE_URL),
        repoRoot: 'C:\\repo',
        scanRepo: scan,
        ...effects,
      }),
    GuardError,
  );
  assert.equal(effects.spawnJest.calls.length, 0);
  assert.equal(effects.queryServerAddr.calls.length, 0);
  assert.equal(effects.inspectContainer.calls.length, 0);
  assert.equal(effects.spawn.calls.length, 0);
});

test('run mode starts Jest only after a clean scan and does not probe', async () => {
  const effects = sideEffects();
  const scan = tap(() => []);
  const result = await dispatchRunner({
    argv: ['--run'],
    env: envWith(SAFE_URL),
    repoRoot: 'C:\\repo',
    scanRepo: scan,
    ...effects,
  });
  assert.equal(result.mode, 'run');
  assert.equal(scan.calls.length, 1);
  assert.equal(effects.spawnJest.calls.length, 1);
  assert.equal(effects.spawnJest.calls[0][1][2], 'jest.integration.config.js');
  assert.equal(effects.spawnJest.calls[0][2].env.CARDON_IT_DATABASE_URL, result.parsed.href);
  assert.equal(effects.spawnJest.calls[0][2].env.DATABASE_URL, '');
  assert.equal(Object.values(effects.spawnJest.calls[0][2].env).includes(SHARED_URL), false);
  assert.equal(effects.queryServerAddr.calls.length, 0);
  assert.equal(effects.inspectContainer.calls.length, 0);
  assert.equal(effects.factory.calls.length, 0);
  assert.equal(effects.spawn.calls.length, 0);
});

test('migrate mode waits for a successful probe before spawning deploy', async () => {
  const effects = sideEffects();
  const repoRoot = 'C:\\repo';
  await dispatchRunner({ argv: ['--migrate'], env: envWith(SAFE_URL), repoRoot, ...effects });
  assert.equal(effects.queryServerAddr.calls.length, 1);
  assert.equal(effects.spawn.calls.length, 1);
  assert.equal(effects.spawn.calls[0][1][0], prismaCliEntry(repoRoot));
  assert.deepEqual(effects.spawn.calls[0][1].slice(1), ['migrate', 'deploy']);
});

test('migrate mode does not spawn when container verification fails', async () => {
  const effects = sideEffects({ identity: { containerId: '', containerIp: '' } });
  await assert.rejects(
    () => dispatchRunner({ argv: ['--migrate'], env: envWith(SAFE_URL), repoRoot: 'C:\\repo', ...effects }),
    GuardError,
  );
  assert.equal(effects.queryServerAddr.calls.length, 0);
  assert.equal(effects.factory.calls.length, 0);
  assert.equal(effects.spawn.calls.length, 0);
  assert.equal(effects.spawnJest.calls.length, 0);
});

test('accepts a probe that reports cardon_it and the container IP', async () => {
  const effects = sideEffects();
  const parsed = await assertCardonItTarget({ env: envWith(SAFE_URL), ...effects });
  assert.equal(parsed.database, 'cardon_it');
  assert.equal(effects.inspectContainer.calls.length, 1);
  assert.equal(effects.queryServerAddr.calls.length, 1);
  assert.equal(effects.queryServerAddr.calls[0][0], parsed.href);
  assert.equal(effects.factory.calls.length, 0);
  assert.equal(effects.spawn.calls.length, 0);
});

test('rejects a probe database name other than cardon_it before migrate', async () => {
  const effects = sideEffects({ database: 'cardon' });
  await assert.rejects(
    () => dispatchRunner({ argv: ['--migrate'], env: envWith(SAFE_URL), repoRoot: 'C:\\repo', ...effects }),
    (error) => {
      assert.equal(error instanceof GuardError, true);
      assert.equal(error.message, 'Database name is not cardon_it');
      return true;
    },
  );
  assert.equal(effects.queryServerAddr.calls.length, 1);
  assert.equal(effects.factory.calls.length, 0);
  assert.equal(effects.spawn.calls.length, 0);
  assert.equal(effects.spawnJest.calls.length, 0);
  assert.equal(effects.write.calls.length, 0);
});

test('rejects a probe IP that does not match the container before migrate', async () => {
  const effects = sideEffects({ serverAddr: '10.0.0.4' });
  await assert.rejects(
    () => dispatchRunner({ argv: ['--connect'], env: envWith(SAFE_URL), ...effects }),
    (error) => {
      assert.equal(error instanceof GuardError, true);
      assert.equal(error.message, 'Database server address does not match the test container IP');
      return true;
    },
  );
  assert.equal(effects.queryServerAddr.calls.length, 1);
  assert.equal(effects.spawn.calls.length, 0);
  assert.equal(effects.factory.calls.length, 0);
});

test('does not probe when container id or IP is missing', async () => {
  for (const identity of [
    { containerId: '', containerIp: '172.16.0.8' },
    { containerId: 'cid-test', containerIp: '' },
  ]) {
    const effects = sideEffects({ identity });
    await assert.rejects(
      () => assertCardonItTarget({ env: envWith(SAFE_URL), ...effects }),
      (error) => {
        assert.equal(error instanceof GuardError, true);
        assert.equal(error.message, 'Test container id or IP is not verified');
        return true;
      },
    );
    assert.equal(effects.queryServerAddr.calls.length, 0);
    assert.equal(effects.spawn.calls.length, 0);
  }
});

test('a failed probe does not migrate or create a client', async () => {
  const effects = sideEffects();
  effects.queryServerAddr = tap(async () => {
    throw new Error('password=secret connection refused');
  });
  await assert.rejects(
    () => dispatchRunner({ argv: ['--migrate'], env: envWith(SAFE_URL), repoRoot: 'C:\\repo', ...effects }),
    (error) => {
      assert.equal(error instanceof GuardError, true);
      assert.equal(error.message, 'Database probe failed');
      assert.equal(error.message.includes('secret'), false);
      return true;
    },
  );
  assert.equal(effects.inspectContainer.calls.length, 1);
  assert.equal(effects.queryServerAddr.calls.length, 1);
  assert.equal(effects.factory.calls.length, 0);
  assert.equal(effects.spawn.calls.length, 0);
  assert.equal(effects.spawnJest.calls.length, 0);
});

test('probe result handling accepts cardon_it and rejects other returned rows', () => {
  assert.deepEqual(readProbeRow([{ addr: ' 172.16.0.8/32 ', database: ' cardon_it ' }]), {
    addr: '172.16.0.8/32',
    database: 'cardon_it',
  });
  assert.deepEqual(assertProbeIdentity({ addr: '172.16.0.8/32', database: 'cardon_it' }, '172.16.0.8'), {
    addr: '172.16.0.8/32',
    database: 'cardon_it',
  });
  assert.throws(() => readProbeRow([]), (error) => {
    assert.equal(error instanceof GuardError, true);
    assert.equal(error.message, 'Database server address is missing');
    return true;
  });
  assert.throws(() => readProbeRow([{ addr: '172.16.0.8' }]), (error) => {
    assert.equal(error instanceof GuardError, true);
    assert.equal(error.message, 'Database name is missing');
    return true;
  });
  assert.throws(() => readProbeRow([{ addr: 172, database: 'cardon_it' }]), (error) => {
    assert.equal(error instanceof GuardError, true);
    assert.equal(error.message, 'Database server address is missing');
    return true;
  });
  assert.throws(() => assertProbeIdentity({ addr: '172.16.0.8', database: 'cardon' }, '172.16.0.8'), (error) => {
    assert.equal(error instanceof GuardError, true);
    assert.equal(error.message, 'Database name is not cardon_it');
    assert.equal(error.message.includes('cardon'), true);
    return true;
  });
  assert.throws(() => assertProbeIdentity({ addr: '10.0.0.4', database: 'cardon_it' }, '172.16.0.8'), (error) => {
    assert.equal(error instanceof GuardError, true);
    assert.equal(error.message, 'Database server address does not match the test container IP');
    return true;
  });
});

test('probe uses the returned rows and disconnects even when the row is rejected later', async () => {
  const disconnect = tap(async () => {});
  const query = tap(async (sql) => {
    assert.equal(sql, SERVER_IDENTITY_SQL);
    return [{ addr: '172.16.0.8', database: 'cardon' }];
  });
  const probe = await probeWithClient({ $queryRawUnsafe: query, $disconnect: disconnect });
  assert.deepEqual(probe, { addr: '172.16.0.8', database: 'cardon' });
  assert.equal(query.calls.length, 1);
  assert.equal(disconnect.calls.length, 1);
  assert.throws(() => assertProbeIdentity(probe, '172.16.0.8'), GuardError);
});

test('an empty probe result disconnects and does not produce an identity', async () => {
  const disconnect = tap(async () => {});
  const query = tap(async () => []);
  await assert.rejects(
    () => probeWithClient({ $queryRawUnsafe: query, $disconnect: disconnect }),
    (error) => {
      assert.equal(error instanceof GuardError, true);
      assert.equal(error.message, 'Database server address is missing');
      return true;
    },
  );
  assert.equal(disconnect.calls.length, 1);
});

test('migrate deploy is spawned only after the probe identity matches', async () => {
  const effects = sideEffects();
  const repoRoot = 'C:\\repo';
  const result = await dispatchRunner({ argv: ['--migrate'], env: envWith(SAFE_URL), repoRoot, ...effects });
  assert.equal(result.mode, 'migrate');
  assert.equal(result.parsed.database, 'cardon_it');
  assert.equal(effects.queryServerAddr.calls[0][0], result.parsed.href);
  assert.equal(effects.factory.calls.length, 0);
  assert.equal(effects.spawn.calls.length, 1);
  assert.equal(effects.spawn.calls[0][0], process.execPath);
  assert.deepEqual(effects.spawn.calls[0][1], [prismaCliEntry(repoRoot), 'migrate', 'deploy']);
  assert.equal(effects.spawn.calls[0][2].env.DATABASE_URL, result.parsed.href);
  assert.equal(effects.spawnJest.calls.length, 0);
});

test('rejects unsupported flags and combined modes before any side effect', async () => {
  assert.throws(() => resolveMode(['--seed']), GuardError);
  assert.throws(() => resolveMode(['--connect', '--migrate']), GuardError);
  assert.throws(() => resolveMode(['--run', '--connect']), GuardError);
  const effects = sideEffects();
  await assert.rejects(
    () => dispatchRunner({ argv: ['--migrate', '--run'], env: envWith(SAFE_URL), ...effects }),
    GuardError,
  );
  assert.equal(effects.inspectContainer.calls.length, 0);
  assert.equal(effects.queryServerAddr.calls.length, 0);
  assert.equal(effects.factory.calls.length, 0);
  assert.equal(effects.spawn.calls.length, 0);
  assert.equal(effects.spawnJest.calls.length, 0);
});
