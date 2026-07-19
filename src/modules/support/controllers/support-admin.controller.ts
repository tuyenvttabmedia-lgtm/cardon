import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { ListSupportTicketsQueryDto, ReplySupportTicketDto } from '../dto/support.dto';
import { SUPPORT_PERMISSION } from '../entities/support.constants';
import { SupportService } from '../services/support.service';

@Controller('admin/support/tickets')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions(SUPPORT_PERMISSION)
export class SupportAdminController {
  constructor(private readonly supportService: SupportService) {}

  @Get()
  list(@Query() query: ListSupportTicketsQueryDto) {
    return this.supportService.listAdminTickets(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.supportService.getAdminTicket(id);
  }

  @Post(':id/reply')
  reply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplySupportTicketDto,
  ) {
    return this.supportService.replyAsStaff(id, user.id, dto);
  }

  @Patch(':id/close')
  close(@Param('id', ParseUUIDPipe) id: string) {
    return this.supportService.closeTicket(id);
  }
}
