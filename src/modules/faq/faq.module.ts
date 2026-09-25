import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WebRevalidateModule } from '../web-revalidate/web-revalidate.module';
import { FaqAdminController } from './controllers/faq-admin.controller';
import { FaqPublicController } from './controllers/faq-public.controller';
import { FaqRepository } from './repositories/faq.repository';
import { FaqService } from './services/faq.service';

@Module({
  imports: [AuthModule, WebRevalidateModule],
  controllers: [FaqAdminController, FaqPublicController],
  providers: [FaqRepository, FaqService],
  exports: [FaqService],
})
export class FaqModule {}
