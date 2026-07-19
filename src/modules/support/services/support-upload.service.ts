import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdirSync, writeFileSync } from 'fs';
import { extname, join } from 'path';
import { randomBytes } from 'crypto';
import { CMS_MEDIA_UPLOAD_ROOT } from '../../cms/entities/cms.constants';
import { SUPPORT_UPLOAD_MAX_BYTES, SUPPORT_UPLOAD_MIME } from '../entities/support.constants';

@Injectable()
export class SupportUploadService {
  constructor(private readonly configService: ConfigService) {}

  saveScreenshot(file: Express.Multer.File): { url: string } {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File is required');
    }
    if (file.size > SUPPORT_UPLOAD_MAX_BYTES) {
      throw new BadRequestException('File too large (max 5MB)');
    }
    if (!SUPPORT_UPLOAD_MIME.includes(file.mimetype)) {
      throw new BadRequestException('Only image files are allowed');
    }

    const ext = extname(file.originalname).toLowerCase();
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.png';
    const filename = `${Date.now()}-${randomBytes(6).toString('hex')}${safeExt}`;
    const uploadRoot = join(
      process.cwd(),
      this.configService.get<string>('media.uploadRoot') ?? CMS_MEDIA_UPLOAD_ROOT,
    );
    const folderDir = join(uploadRoot, 'support');
    mkdirSync(folderDir, { recursive: true });
    writeFileSync(join(folderDir, filename), file.buffer);

    return { url: `/uploads/support/${filename}` };
  }
}
