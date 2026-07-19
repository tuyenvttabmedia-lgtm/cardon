import { Injectable } from '@nestjs/common';
import { AdminAuditLogQueryDto } from '../dto/admin.dto';
import { AdminRepository } from '../repositories/admin.repository';

@Injectable()
export class AdminAuditLogService {
  constructor(private readonly repository: AdminRepository) {}

  listAuditLogs(query: AdminAuditLogQueryDto) {
    return this.repository.findAuditLogs({
      userId: query.userId,
      action: query.action,
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
      skip: query.skip,
      take: query.take,
    });
  }
}
