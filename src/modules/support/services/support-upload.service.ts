import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import {
  detectImageKind,
  extensionForImageKind,
  mimeForImageKind,
} from '../../../common/utils/image-magic.util';
import { CMS_MEDIA_UPLOAD_ROOT } from '../../cms/entities/cms.constants';
import {
  SUPPORT_FILES_API_PREFIX,
  SUPPORT_UPLOAD_MAX_BYTES,
  SUPPORT_UPLOAD_MIME,
} from '../entities/support.constants';
import { extractExactSupportAttachmentFilename } from '../entities/support-attachment-url.util';

const SAFE_FILENAME_RE = /^[A-Za-z0-9._-]+$/;

@Injectable()
export class SupportUploadService {
  constructor(private readonly configService: ConfigService) {}

  getSupportDir(): string {
    const uploadRoot = join(
      process.cwd(),
      this.configService.get<string>('media.uploadRoot') ?? CMS_MEDIA_UPLOAD_ROOT,
    );
    return join(uploadRoot, 'support');
  }

  /**
   * Store screenshot under uploads/support with user-scoped unique name.
   * Returns API-relative download path (not a public static URL).
   */
  saveScreenshot(userId: string, file: Express.Multer.File): { url: string; filename: string } {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File is required');
    }
    if (file.size > SUPPORT_UPLOAD_MAX_BYTES) {
      throw new BadRequestException('File too large (max 5MB)');
    }
    if (!SUPPORT_UPLOAD_MIME.includes(file.mimetype)) {
      throw new BadRequestException('Only JPEG, PNG, and WebP images are allowed');
    }

    const kind = detectImageKind(file.buffer);
    if (!kind) {
      throw new BadRequestException('File content is not a valid JPEG, PNG, or WebP image');
    }
    const expectedMime = mimeForImageKind(kind);
    if (file.mimetype !== expectedMime) {
      throw new BadRequestException('MIME type does not match file content');
    }

    const ext = extensionForImageKind(kind);
    const filename = `${userId}_${Date.now()}_${randomBytes(16).toString('hex')}${ext}`;
    if (!SAFE_FILENAME_RE.test(filename)) {
      throw new BadRequestException('Invalid generated filename');
    }

    const folderDir = this.getSupportDir();
    mkdirSync(folderDir, { recursive: true });
    writeFileSync(join(folderDir, filename), file.buffer);

    return {
      filename,
      url: `${SUPPORT_FILES_API_PREFIX}${filename}`,
    };
  }

  assertSafeFilename(filename: string): string {
    const raw = filename.trim();
    if (
      !raw ||
      raw.includes('..') ||
      raw.includes('/') ||
      raw.includes('\\') ||
      !SAFE_FILENAME_RE.test(raw)
    ) {
      throw new ForbiddenException('Invalid filename');
    }
    return raw;
  }

  resolveFilePath(filename: string): string {
    const safe = this.assertSafeFilename(filename);
    return join(this.getSupportDir(), safe);
  }

  openReadStream(filename: string): {
    stream: ReturnType<typeof createReadStream>;
    mimeType: string;
    filename: string;
  } {
    const safe = this.assertSafeFilename(filename);
    const filePath = join(this.getSupportDir(), safe);
    if (!existsSync(filePath)) {
      throw new NotFoundException('Attachment not found');
    }
    const ext = safe.includes('.') ? safe.slice(safe.lastIndexOf('.')).toLowerCase() : '';
    const mimeType =
      ext === '.png'
        ? 'image/png'
        : ext === '.webp'
          ? 'image/webp'
          : 'image/jpeg';
    return {
      stream: createReadStream(filePath),
      mimeType,
      filename: safe,
    };
  }

  /** Extract bare filename from legacy `/uploads/support/x` or API file paths (exact). */
  extractFilenameFromAttachmentUrl(url: string): string | null {
    return extractExactSupportAttachmentFilename(url);
  }
}
