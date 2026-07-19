import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { NotificationModule } from '../notification/notification.module';
import { ContactAdminController } from './controllers/contact-admin.controller';
import { ContactPublicController } from './controllers/contact-public.controller';
import { ContactRepository } from './repositories/contact.repository';
import { ContactService } from './services/contact.service';

@Module({
  imports: [AuthModule, NotificationModule, ConfigModule],
  controllers: [ContactPublicController, ContactAdminController],
  providers: [ContactRepository, ContactService],
  exports: [ContactService],
})
export class ContactModule {}
