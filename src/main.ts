import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { RequestMethod } from '@nestjs/common';
import { join } from 'path';
import express from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { getAppProcessRole, shouldRegisterHttp } from './config/process-role';
import { AppLoggerService } from './logger/app-logger.service';



async function bootstrap(): Promise<void> {

  const role = getAppProcessRole();

  if (!shouldRegisterHttp()) {

    // eslint-disable-next-line no-console

    console.error(

      `APP_ROLE=${role} — HTTP API requires APP_ROLE=api or APP_ROLE=all. Use worker.ts for workers.`,

    );

    process.exit(1);

  }



  const app = await NestFactory.create(AppModule, {

    bufferLogs: true,

  });



  const configService = app.get(ConfigService);

  const logger = app.get(AppLoggerService);

  app.useLogger(logger);



  const isProduction = configService.get<string>('app.env') === 'production';

  app.use(

    helmet({

      contentSecurityPolicy: isProduction ? undefined : false,

      hsts: isProduction,

    }),

  );



  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));



  const corsOrigins = configService.get<string[]>('app.corsOrigins') ?? [];

  app.enableCors({

    origin: isProduction ? corsOrigins : true,

    credentials: true,

  });



  app.useGlobalPipes(

    new ValidationPipe({

      whitelist: true,

      forbidNonWhitelisted: true,

      transform: true,

      transformOptions: {

        enableImplicitConversion: true,

      },

    }),

  );



  const apiPrefix = configService.get<string>('app.apiPrefix') ?? 'api/v1';

  app.setGlobalPrefix(apiPrefix, {

    exclude: [

      'health',

      { path: 'health/(.*)', method: RequestMethod.ALL },

      { path: 'api/partner/v1', method: RequestMethod.ALL },

      { path: 'api/partner/v1/(.*)', method: RequestMethod.ALL },

    ],

  });



  app.enableShutdownHooks();



  const port = configService.get<number>('app.port') ?? 3000;

  await app.listen(port);

  logger.log(`API server running on port ${port} (APP_ROLE=${role})`, 'Bootstrap');

}



bootstrap();


