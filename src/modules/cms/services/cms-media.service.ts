import {

  BadRequestException,

  Injectable,

  NotFoundException,

} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { assertAllowedMimeType, assertSafeUploadFilename } from '../entities/media-upload.security';

import { CmsRepository } from '../repositories/cms.repository';

import { CmsMediaStorageService } from './cms-media-storage.service';



export interface ListMediaFilters {

  folder?: string;

  search?: string;

  mimeType?: string;

}



@Injectable()

export class CmsMediaService {

  constructor(

    private readonly repository: CmsRepository,

    private readonly storage: CmsMediaStorageService,

    private readonly configService: ConfigService,

  ) {}



  listMedia(filters: ListMediaFilters = {}) {

    return this.repository.listMedia(filters);

  }



  async upload(

    file: Express.Multer.File,

    meta?: { alt?: string; title?: string; folder?: string },

  ) {

    if (!file) throw new BadRequestException('File is required');



    assertSafeUploadFilename(file.originalname);

    assertAllowedMimeType(file.mimetype, file.originalname);



    const maxBytes = this.storage.getMaxBytes();

    if (file.size > maxBytes) {

      throw new BadRequestException(`File exceeds ${Math.round(maxBytes / 1024 / 1024)}MB limit`);

    }



    const stored = await this.storage.saveLocal(file, meta?.folder);

    return this.repository.createMedia({

      filename: stored.filename,

      originalName: file.originalname,

      mimeType: stored.mimeType,

      size: stored.size,

      url: stored.url,

      alt: meta?.alt,

      title: meta?.title,

      storageKey: stored.storageKey,

      storage: stored.storage,

      folder: stored.folder,

      width: stored.width,

      height: stored.height,

      thumbnailUrl: stored.thumbnailUrl,

    });

  }



  async deleteMedia(id: string) {

    const media = await this.repository.findMediaById(id);

    if (!media) throw new NotFoundException('Media not found');

    if (media.storageKey) {

      this.storage.deleteLocalFile(media.storageKey);

    }

    return this.repository.softDeleteMedia(id);

  }

}


