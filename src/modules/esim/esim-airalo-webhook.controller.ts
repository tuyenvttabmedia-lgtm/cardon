import { Body, Controller, Head, HttpCode, Post } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { EsimAiraloWebhookService } from './esim-airalo-webhook.service';

/**
 * Public Airalo inbound webhooks.
 * Opt-in URL: https://cardon.vn/api/v1/webhooks/airalo/low-data
 * Airalo verifies with HEAD then sends POST usage alerts.
 */
@Controller('webhooks/airalo')
@SkipThrottle()
export class EsimAiraloWebhookController {
  constructor(private readonly webhooks: EsimAiraloWebhookService) {}

  @Head('low-data')
  @HttpCode(200)
  headLowData(): void {
    return;
  }

  @Post('low-data')
  @HttpCode(200)
  lowData(@Body() body: unknown) {
    return this.webhooks.handleLowData(body);
  }
}
