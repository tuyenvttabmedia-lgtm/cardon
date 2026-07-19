import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { CreateSupportTicketDto } from '../dto/support.dto';
import { SupportService } from '../services/support.service';
import { SupportUploadService } from '../services/support-upload.service';

@Controller('account/support')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
export class SupportAccountController {
  constructor(
    private readonly supportService: SupportService,
    private readonly uploadService: SupportUploadService,
  ) {}

  @Get('tickets')
  listTickets(@CurrentUser() user: AuthenticatedUser) {
    return this.supportService.listCustomerTickets(user.id);
  }

  @Get('tickets/:id')
  getTicket(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.supportService.getCustomerTicket(id, user.id);
  }

  @Post('tickets')
  createTicket(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSupportTicketDto) {
    return this.supportService.createTicket(user.id, dto);
  }

  @Post('tickets/:id/messages')
  addMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { message: string; attachmentUrl?: string },
  ) {
    return this.supportService.addCustomerMessage(
      id,
      user.id,
      body.message,
      body.attachmentUrl,
    );
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  uploadScreenshot(@UploadedFile() file: Express.Multer.File) {
    return this.uploadService.saveScreenshot(file);
  }
}
