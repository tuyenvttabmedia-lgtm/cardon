import { ApplicationConfig } from '@nestjs/core/application-config';
import { NestContainer } from '@nestjs/core/injector/container';
import { GraphInspector } from '@nestjs/core/inspector/graph-inspector';
import { MetadataScanner } from '@nestjs/core/metadata-scanner';
import { DependenciesScanner } from '@nestjs/core/scanner';

const PROCESSOR_METADATA = 'bullmq:processor_metadata';
const WORKER_NAMES = ['ProviderWorker', 'TopupWorker', 'EsimWorker'] as const;

/**
 * Module-graph registration only. scan() does not construct providers,
 * open Redis, or run a worker process.
 */
async function scanRole(role: 'worker' | 'api', moduleFile: './worker.module' | './app.module', exportName: string) {
  process.env.APP_ROLE = role;
  // ConfigModule validates on import; graph scan never connects to Redis/DB.
  process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
  process.env.JWT_SECRET ??= 'wave2-graph-test-jwt-secret-32chars!!';
  process.env.ENCRYPTION_KEY ??= '0123456789abcdef0123456789abcdef';
  process.env.DATABASE_URL ??= 'postgresql://cardon:cardon@127.0.0.1:5432/cardon';
  jest.resetModules();
  const imported = await import(moduleFile);
  const root = imported[exportName];
  const container = new NestContainer();
  const scanner = new DependenciesScanner(
    container,
    new MetadataScanner(),
    new GraphInspector(container),
    new ApplicationConfig(),
  );
  await scanner.scan(root);
  return container;
}

function countWorkers(container: NestContainer) {
  const counts: Record<(typeof WORKER_NAMES)[number], number> = {
    ProviderWorker: 0,
    TopupWorker: 0,
    EsimWorker: 0,
  };
  const queues: Record<string, string | undefined> = {};
  for (const moduleRef of container.getModules().values()) {
    for (const wrapper of moduleRef.providers.values()) {
      const metatype = wrapper.metatype as (new () => unknown) & { name?: string } | null | undefined;
      const name = metatype?.name;
      if (!metatype || (name !== 'ProviderWorker' && name !== 'TopupWorker' && name !== 'EsimWorker')) {
        continue;
      }
      counts[name] += 1;
      const metadata = Reflect.getMetadata(PROCESSOR_METADATA, metatype) as { name?: string } | undefined;
      queues[name] = metadata?.name;
    }
  }
  return { counts, queues };
}

describe('B3.54 worker module graph', () => {
  const previousRole = process.env.APP_ROLE;

  afterAll(() => {
    if (previousRole === undefined) {
      delete process.env.APP_ROLE;
    } else {
      process.env.APP_ROLE = previousRole;
    }
    jest.resetModules();
  });

  it('registers each worker once on its queue when APP_ROLE=worker', async () => {
    const container = await scanRole('worker', './worker.module', 'WorkerAppModule');
    const { counts, queues } = countWorkers(container);

    expect(counts).toEqual({
      ProviderWorker: 1,
      TopupWorker: 1,
      EsimWorker: 1,
    });
    expect(queues).toEqual({
      ProviderWorker: 'provider_queue',
      TopupWorker: 'topup_queue',
      EsimWorker: 'esim_queue',
    });
  });

  it('does not register job workers on the API module graph', async () => {
    const container = await scanRole('api', './app.module', 'AppModule');
    const { counts } = countWorkers(container);

    expect(counts).toEqual({
      ProviderWorker: 0,
      TopupWorker: 0,
      EsimWorker: 0,
    });
  });
});
