import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { SUPPORT_PERMISSION } from '../entities/support.constants';
import { SupportUploadService } from '../services/support-upload.service';

/** Authenticated staff download for support attachments (including legacy files). */
@Controller('admin/support/files')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions(SUPPORT_PERMISSION)
export class SupportAdminFilesController {
  constructor(private readonly uploadService: SupportUploadService) {}

  @Get(':filename')
  download(@Param('filename') filename: string, @Res() res: Response) {
    const { stream, mimeType, filename: safeName } =
      this.uploadService.openReadStream(filename);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    stream.pipe(res);
  }
}
