import {
  Body,
  Controller,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Request } from 'express';
import { Public } from '../../../common/decorators/public.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { OptionalJwtAuthGuard } from '../../auth/guards/optional-jwt-auth.guard';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AgentDepositWebhookService } from '../../agent-deposit/services/agent-deposit-webhook.service';
import { PlatformMaintenanceGuard } from '../../maintenance-center/guards/platform-maintenance.guard';
import { MaintenanceModule } from '../../maintenance-center/decorators/maintenance-module.decorator';
import { IDEMPOTENCY_KEY_HEADER } from '../entities/payment.constants';
import { CreatePaymentDto } from '../dto/create-payment.dto';
import { PaymentService } from '../services/payment.service';

@Controller('payments')
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly moduleRef: ModuleRef,
  ) {}

  @Post()
  @UseGuards(OptionalJwtAuthGuard, PlatformMaintenanceGuard)
  @MaintenanceModule('payment')
  createPayment(
    @Body() dto: CreatePaymentDto,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.paymentService.createPayment(dto, idempotencyKey, user);
  }

  @Post('webhook/:gateway')
  @Public()
  async handleWebhook(
    @Param('gateway') gateway: string,
    @Body() payload: unknown,
    @Headers() headers: Record<string, string>,
    @Req() req: Request,
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.ip;

    const agentDepositWebhook = this.resolveAgentDepositWebhook();
    if (agentDepositWebhook) {
      const depositResult = await agentDepositWebhook.tryHandle(
        gateway,
        payload,
        headers,
        ip,
      );
      if (depositResult.handled) {
        return {
          ok: true,
          duplicate: depositResult.duplicate,
          paymentReference: depositResult.paymentReference,
          source: 'agent_deposit',
        };
      }
    }

    const result = await this.paymentService.handleWebhook(
      gateway,
      payload,
      headers,
      ip,
    );
    return this.formatWebhookResponse(gateway, result);
  }

  private formatWebhookResponse(
    gateway: string,
    result: Awaited<ReturnType<PaymentService['handleWebhook']>>,
  ) {
    if (gateway.toLowerCase() === 'sepay') {
      return { success: true, ...result };
    }
    return result;
  }

  private resolveAgentDepositWebhook(): AgentDepositWebhookService | null {
    try {
      return this.moduleRef.get(AgentDepositWebhookService, { strict: false });
    } catch {
      return null;
    }
  }
}
