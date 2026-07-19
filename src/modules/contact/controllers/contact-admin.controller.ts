import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ContactMessageStatus } from '@prisma/client';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { CMS_PERMISSION } from '../../cms/entities/cms.constants';
import { ListContactMessagesQueryDto } from '../dto/contact.dto';
import { ContactService } from '../services/contact.service';

@Controller('admin/contact-messages')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions(CMS_PERMISSION)
export class ContactAdminController {
  constructor(private readonly contactService: ContactService) {}

  @Get()
  list(@Query() query: ListContactMessagesQueryDto) {
    const status =
      query.status === 'NEW' || query.status === 'PROCESSED'
        ? (query.status as ContactMessageStatus)
        : undefined;
    return this.contactService.list(status);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.contactService.getById(id);
  }

  @Patch(':id/processed')
  markProcessed(@Param('id', ParseUUIDPipe) id: string) {
    return this.contactService.markProcessed(id);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.contactService.delete(id);
  }
}
