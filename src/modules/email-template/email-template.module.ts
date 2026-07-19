import { Module } from '@nestjs/common';
import { EmailTemplateRepository } from './repositories/email-template.repository';
import { EmailTemplateService } from './services/email-template.service';

@Module({
  providers: [EmailTemplateRepository, EmailTemplateService],
  exports: [EmailTemplateService],
})
export class EmailTemplateModule {}
