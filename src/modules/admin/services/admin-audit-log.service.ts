import { Injectable } from '@nestjs/common';
import { AdminAuditLogQueryDto } from '../dto/admin.dto';
import { AdminRepository } from '../repositories/admin.repository';
import { vietnamDayBounds, vietnamDayEndInclusive } from '../../../common/utils/vietnam-time.util';

@Injectable()
export class AdminAuditLogService {
  constructor(private readonly repository: AdminRepository) {}

  listAuditLogs(query: AdminAuditLogQueryDto) {
    return this.repository.findAuditLogs({
      userId: query.userId,
      action: query.action,
      dateFrom: query.dateFrom ? vietnamDayBounds(query.dateFrom).start : undefined,
      dateTo: query.dateTo ? vietnamDayEndInclusive(query.dateTo) : undefined,
      skip: query.skip,
      take: query.take,
    });
  }
}
