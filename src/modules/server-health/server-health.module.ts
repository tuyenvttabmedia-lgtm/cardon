import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { QueueMonitorModule } from '../queue-monitor/queue-monitor.module';
import { ServerHealthController } from './controllers/server-health.controller';
import { ServerHealthService } from './services/server-health.service';

@Module({
  imports: [AuthModule, QueueMonitorModule],
  controllers: [ServerHealthController],
  providers: [ServerHealthService],
  exports: [ServerHealthService],
})
export class ServerHealthModule {}
