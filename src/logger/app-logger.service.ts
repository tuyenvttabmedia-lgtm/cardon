import { Injectable, LoggerService } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';



@Injectable()

export class AppLoggerService implements LoggerService {
  private readonly structured: boolean;



  constructor(private readonly configService: ConfigService) {

    this.structured = this.configService.get<string>('app.env') === 'production';

  }



  log(message: string, context?: string): void {

    this.write('log', message, context);

  }



  error(message: string, trace?: string, context?: string): void {

    if (this.structured) {
      // eslint-disable-next-line no-console
      console.error(
        JSON.stringify({
          level: 'error',
          message,
          context,
          trace: trace ? '[stack omitted]' : undefined,
          ts: new Date().toISOString(),
        }),
      );
      return;
    }

    const prefix = context ? `[${context}] ` : '';
    // eslint-disable-next-line no-console
    console.error(`${prefix}${message}`, trace ?? '');

  }



  warn(message: string, context?: string): void {

    this.write('warn', message, context);

  }



  debug(message: string, context?: string): void {

    this.write('debug', message, context);

  }



  verbose(message: string, context?: string): void {

    this.write('verbose', message, context);

  }



  private write(level: string, message: string, context?: string): void {
    if (this.structured) {
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({
          level,
          message,
          context,
          ts: new Date().toISOString(),
        }),
      );
      return;
    }

    const prefix = context ? `[${context}] ` : '';
    const line = `${prefix}${message}`;
    // Avoid Nest Logger here — app.useLogger() would recurse into this service.
    if (level === 'warn') {
      // eslint-disable-next-line no-console
      console.warn(line);
    } else if (level === 'debug') {
      // eslint-disable-next-line no-console
      console.debug(line);
    } else if (level === 'verbose') {
      // eslint-disable-next-line no-console
      console.debug(line);
    } else {
      // eslint-disable-next-line no-console
      console.log(line);
    }
  }

}


