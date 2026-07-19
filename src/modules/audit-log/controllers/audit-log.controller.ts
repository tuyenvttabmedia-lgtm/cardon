import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { AuditLogQueryDto } from '../dto/audit-log.dto';
import { AuditLogService } from '../services/audit-log.service';

@Controller('admin/audit')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @Permissions('audit.read')
  findAll(@Query() query: AuditLogQueryDto) {
    return this.auditLogService.findAll(query);
  }

  @Get('export/csv')
  @Permissions('audit.export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(@Query() query: AuditLogQueryDto, @Res() res: Response) {
    const { buffer, filename } = await this.auditLogService.exportCsv(query);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Get('export/excel')
  @Permissions('audit.export')
  async exportExcel(@Query() query: AuditLogQueryDto, @Res() res: Response) {
    const { buffer, filename } = await this.auditLogService.exportExcel(query);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.send(buffer);
  }

  @Get(':id')
  @Permissions('audit.read')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.auditLogService.findOne(id);
  }
}
