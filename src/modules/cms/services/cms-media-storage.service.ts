import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { extname, join } from 'path';
import sharp from 'sharp';
import {
  buildSafeStoredFilename,
  MediaFolder,
  normalizeMediaFolder,
  resolveThumbPath,
  resolveCardPath,
  resolveUploadPath,
} from '../entities/media-upload.security';
import { CMS_MEDIA_UPLOAD_ROOT } from '../entities/cms.constants';

export interface StoredMediaFile {
  filename: string;
  storageKey: string;
  url: string;
  thumbnailUrl?: string;
  storage: 'local';
  folder: MediaFolder;
  width?: number;
  height?: number;
  size: number;
  mimeType: string;
}

@Injectable()
export class CmsMediaStorageService {
  constructor(private readonly configService: ConfigService) {}

  getUploadRoot(): string {
    const configured = this.configService.get<string>('media.uploadRoot');
    return join(process.cwd(), configured ?? CMS_MEDIA_UPLOAD_ROOT);
  }

  getMaxBytes(): number {
    return this.configService.get<number>('media.maxBytes') ?? 5 * 1024 * 1024;
  }

  shouldGenerateWebp(): boolean {
    return this.configService.get<boolean>('media.generateWebp') === true;
  }

  /** Local disk storage under uploads/{folder}/ with optional thumbnail + compression. */
  async saveLocal(
    file: Express.Multer.File,
    folderInput?: string,
  ): Promise<StoredMediaFile> {
    const folder = normalizeMediaFolder(folderInput);
    const uploadRoot = this.getUploadRoot();
    const folderDir = join(uploadRoot, folder);
    const thumbDir = join(folderDir, 'thumbs');
    const cardDir = join(folderDir, 'cards');
    mkdirSync(thumbDir, { recursive: true });
    mkdirSync(cardDir, { recursive: true });

    const filename = buildSafeStoredFilename(file.originalname);
    const filePath = resolveUploadPath(uploadRoot, folder, filename);
    const ext = extname(filename).toLowerCase();
    const isSvg = ext === '.svg';

    let buffer = file.buffer;
    let width: number | undefined;
    let height: number | undefined;
    let mimeType = file.mimetype;
    let size = file.size;

    if (!isSvg) {
      const image = sharp(buffer, { failOn: 'none' });
      const meta = await image.metadata();
      width = meta.width;
      height = meta.height;

      if (ext === '.jpg' || ext === '.jpeg') {
        buffer = await sharp(buffer).jpeg({ quality: 85, mozjpeg: true }).toBuffer();
        mimeType = 'image/jpeg';
      } else if (ext === '.png') {
        buffer = await sharp(buffer).png({ compressionLevel: 8 }).toBuffer();
        mimeType = 'image/png';
      }

      size = buffer.length;
      writeFileSync(filePath, buffer);

      const thumbFilename = filename.replace(/\.[^.]+$/, '.webp');
      const thumbPath = resolveThumbPath(uploadRoot, folder, thumbFilename);
      await sharp(buffer)
        .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(thumbPath);

      const cardFilename = thumbFilename;
      const cardPath = resolveCardPath(uploadRoot, folder, cardFilename);
      await sharp(buffer)
        .resize(640, 360, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(cardPath);

      if (this.shouldGenerateWebp() && ext !== '.webp') {
        const webpName = filename.replace(/\.[^.]+$/, '.webp');
        const webpPath = resolveUploadPath(uploadRoot, folder, webpName);
        await sharp(buffer).webp({ quality: 85 }).toFile(webpPath);
      }
    } else {
      writeFileSync(filePath, buffer);
    }

    const urlPath = `/uploads/${folder}/${filename}`;
    const url = urlPath;

    const thumbFilename = isSvg ? filename : filename.replace(/\.[^.]+$/, '.webp');
    const thumbPath = `/uploads/${folder}/thumbs/${thumbFilename}`;
    const thumbnailUrl = isSvg ? url : thumbPath;

    return {
      filename,
      storageKey: `${folder}/${filename}`,
      url,
      thumbnailUrl: isSvg ? url : thumbnailUrl,
      storage: 'local',
      folder,
      width,
      height,
      size,
      mimeType,
    };
  }

  deleteLocalFile(storageKey: string): void {
    const uploadRoot = this.getUploadRoot();
    const normalized = storageKey.replace(/\\/g, '/');
    if (normalized.includes('..')) return;

    const parts = normalized.split('/');
    const filename = parts.pop();
    const folder = parts.join('/') || 'general';
    if (!filename) return;

    const paths = [
      join(uploadRoot, folder, filename),
      join(uploadRoot, folder, 'thumbs', filename.replace(/\.[^.]+$/, '.webp')),
      join(uploadRoot, folder, 'cards', filename.replace(/\.[^.]+$/, '.webp')),
      join(uploadRoot, folder, filename.replace(/\.[^.]+$/, '.webp')),
    ];

    for (const p of paths) {
      try {
        unlinkSync(p);
      } catch {
        /* file may not exist */
      }
    }
  }
}
