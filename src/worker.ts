import { NestFactory } from '@nestjs/core';
import { getAppProcessRole, shouldRegisterWorkers } from './config/process-role';
import { AppLoggerService } from './logger/app-logger.service';
import { WorkerAppModule } from './worker.module';

async function bootstrap(): Promise<void> {
  const role = getAppProcessRole();
  if (!shouldRegisterWorkers()) {
    // eslint-disable-next-line no-console
    console.error(
      `APP_ROLE=${role} — worker process requires APP_ROLE=worker or APP_ROLE=all`,
    );
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(WorkerAppModule, {
    bufferLogs: true,
  });

  const logger = app.get(AppLoggerService);
  app.useLogger(logger);
  app.enableShutdownHooks();

  logger.log(`Worker process started (APP_ROLE=${role})`, 'WorkerBootstrap');

  process.on('SIGTERM', () => {
    logger.log('SIGTERM received — shutting down workers', 'WorkerBootstrap');
  });
  process.on('SIGINT', () => {
    logger.log('SIGINT received — shutting down workers', 'WorkerBootstrap');
  });
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
