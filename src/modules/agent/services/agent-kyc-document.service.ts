import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  assertAllowedMimeType,
  buildSafeStoredFilename,
} from '../../cms/entities/media-upload.security';
import { CMS_MEDIA_UPLOAD_ROOT } from '../../cms/entities/cms.constants';

const KYC_MAX_BYTES = 10 * 1024 * 1024;
const KYC_ALLOWED_FIELDS = new Set([
  'cccdFront',
  'cccdBack',
  'selfie',
  'businessLicense',
  'citizenId',
  'businessRegistration',
  'authorizationLetter',
]);

export type StoredKycDocument = {
  field: string;
  storageKey: string;
  filename: string;
  mimeType: string;
  size: number;
};

@Injectable()
export class AgentKycDocumentService {
  constructor(private readonly configService: ConfigService) {}

  getUploadRoot(): string {
    const configured = this.configService.get<string>('media.uploadRoot');
    return join(process.cwd(), configured ?? CMS_MEDIA_UPLOAD_ROOT);
  }

  async saveDocument(
    agentId: string,
    field: string,
    file: Express.Multer.File,
  ): Promise<StoredKycDocument> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File is required');
    }
    if (!KYC_ALLOWED_FIELDS.has(field)) {
      throw new BadRequestException(`Invalid document field: ${field}`);
    }
    if (file.size > KYC_MAX_BYTES) {
      throw new BadRequestException('File exceeds 10MB limit');
    }

    assertAllowedMimeType(file.mimetype, file.originalname);
    const filename = buildSafeStoredFilename(file.originalname);
    const storageKey = `kyc/${agentId}/${filename}`;
    const dir = join(this.getUploadRoot(), 'kyc', agentId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, filename), file.buffer);

    return {
      field,
      storageKey,
      filename,
      mimeType: file.mimetype,
      size: file.size,
    };
  }

  resolveFilePath(agentId: string, storageKey: string): string {
    const normalized = storageKey.replace(/\\/g, '/');
    const prefix = `kyc/${agentId}/`;
    if (!normalized.startsWith(prefix) || normalized.includes('..')) {
      throw new ForbiddenException('Invalid document key');
    }
    const filename = normalized.slice(prefix.length);
    if (!filename || filename.includes('/')) {
      throw new ForbiddenException('Invalid document key');
    }
    return join(this.getUploadRoot(), 'kyc', agentId, filename);
  }

  openReadStream(agentId: string, storageKey: string) {
    const filePath = this.resolveFilePath(agentId, storageKey);
    try {
      return createReadStream(filePath);
    } catch {
      throw new NotFoundException('Document not found');
    }
  }
}
