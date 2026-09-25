import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CmsWebRevalidateService } from '../cms/services/cms-web-revalidate.service';

/**
 * Leaf module for Next.js on-demand revalidate.
 * Kept separate from CmsModule to avoid Nest circular imports
 * (ProductModule / AuthModule chains must not pull CmsModule).
 */
@Module({
  imports: [ConfigModule],
  providers: [CmsWebRevalidateService],
  exports: [CmsWebRevalidateService],
})
export class WebRevalidateModule {}
