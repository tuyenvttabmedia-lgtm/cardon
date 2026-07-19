import {

  Injectable,

  Logger,

  OnModuleDestroy,

  OnModuleInit,

} from '@nestjs/common';

import { shouldRegisterWorkers } from '../../../config/process-role';

import { SystemHealthService } from './system-health.service';



const MS_PER_DAY = 24 * 60 * 60 * 1000;



@Injectable()

export class SystemHealthCronService implements OnModuleInit, OnModuleDestroy {

  private readonly logger = new Logger(SystemHealthCronService.name);

  private timer?: ReturnType<typeof setTimeout>;

  private interval?: ReturnType<typeof setInterval>;



  constructor(private readonly healthService: SystemHealthService) {}



  onModuleInit(): void {

    if (!shouldRegisterWorkers()) return;

    this.scheduleDaily();

  }



  onModuleDestroy(): void {

    if (this.timer) clearTimeout(this.timer);

    if (this.interval) clearInterval(this.interval);

  }



  private scheduleDaily() {

    const now = new Date();

    const next = new Date(now);

    next.setHours(3, 0, 0, 0);

    if (next <= now) {

      next.setDate(next.getDate() + 1);

    }

    const delay = next.getTime() - now.getTime();

    this.healthService.setCronSchedule(next.toISOString());

    this.logger.log(`System health cron scheduled at 03:00 (in ${Math.round(delay / 60000)} min)`);



    this.timer = setTimeout(() => {

      void this.runDaily();

      this.interval = setInterval(() => void this.runDaily(), MS_PER_DAY);

    }, delay);

  }



  private async runDaily() {

    this.logger.log('Running scheduled system health scan');

    this.healthService.recordCronRun();

    const next = new Date();

    next.setDate(next.getDate() + 1);

    next.setHours(3, 0, 0, 0);

    this.healthService.setCronSchedule(next.toISOString());

    try {

      await this.healthService.runScan(true);

    } catch (error) {

      this.logger.warn(

        `Scheduled health scan failed: ${error instanceof Error ? error.message : String(error)}`,

      );

    }

  }

}

