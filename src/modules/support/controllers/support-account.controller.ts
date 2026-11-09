import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import type { Request, Response } from 'express';
import { AbuseRateLimitService } from '../../../common/abuse-rate-limit/abuse-rate-limit.service';
import { TURNSTILE_ACTION_SUPPORT_TICKET } from '../../../common/turnstile/turnstile.constants';
import { TurnstileService } from '../../../common/turnstile/turnstile.service';
import { extractClientIp } from '../../../common/utils/request-client.util';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { CreateSupportTicketDto, CustomerSupportMessageDto } from '../dto/support.dto';
import { SupportService } from '../services/support.service';
import { SupportUploadService } from '../services/support-upload.service';

@Controller('account/support')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
export class SupportAccountController {
  constructor(
    private readonly supportService: SupportService,
    private readonly uploadService: SupportUploadService,
    private readonly abuseRateLimit: AbuseRateLimitService,
    private readonly turnstile: TurnstileService,
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
  async createTicket(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSupportTicketDto,
    @Req() req: Request,
  ) {
    const ip = extractClientIp(req);
    await this.turnstile.verifyOrThrow({
      token: dto.captchaToken,
      remoteIp: ip,
      expectedAction: TURNSTILE_ACTION_SUPPORT_TICKET,
    });
    await this.abuseRateLimit.consumeOrThrow({
      bucket: 'support_ticket_create',
      userId: user.id,
      ip,
    });
    return this.supportService.createTicket(user.id, dto);
  }

  @Post('tickets/:id/messages')
  async addMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CustomerSupportMessageDto,
  ) {
    await this.abuseRateLimit.consumeOrThrow({
      bucket: 'support_message',
      userId: user.id,
    });
    return this.supportService.addCustomerMessage(
      id,
      user.id,
      body.message,
      body.attachmentUrl,
    );
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadScreenshot(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    await this.abuseRateLimit.consumeOrThrow({
      bucket: 'support_upload',
      userId: user.id,
    });
    return this.uploadService.saveScreenshot(user.id, file);
  }

  @Get('files/:filename')
  async downloadFile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    await this.supportService.assertCustomerCanDownload(user.id, filename);
    const { stream, mimeType, filename: safeName } =
      this.uploadService.openReadStream(filename);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    stream.pipe(res);
  }
}
