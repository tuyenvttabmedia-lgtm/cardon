import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { API_LOG_RETENTION_DAYS_DEFAULT } from '../entities/api-observability.constants';
import { AgentApiRequestLogService } from './agent-api-request-log.service';

@Injectable()
export class ApiLogRetentionService implements OnModuleInit {
  private readonly logger = new Logger(ApiLogRetentionService.name);

  constructor(private readonly logService: AgentApiRequestLogService) {}

  onModuleInit() {
    const dayMs = 86_400_000;
    void this.purge();
    setInterval(() => void this.purge(), dayMs);
  }

  private async purge() {
    const result = await this.logService.purgeExpired(API_LOG_RETENTION_DAYS_DEFAULT);
    if (result.count > 0) {
      this.logger.log(`Purged ${result.count} API logs (retention ${API_LOG_RETENTION_DAYS_DEFAULT}d)`);
    }
  }
}
