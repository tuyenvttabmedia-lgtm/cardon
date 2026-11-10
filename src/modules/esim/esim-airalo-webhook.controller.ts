import {
  Body,
  Controller,
  Get,
  Head,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';
import { EsimAiraloWebhookService } from './esim-airalo-webhook.service';

/**
 * Public Airalo inbound webhooks.
 * Prefer DNS-only host + secret token query (?token=) after opt-in.
 * Accessibility check uses HEAD/GET; alerts arrive as POST.
 */
@Controller('webhooks/airalo')
export class EsimAiraloWebhookController {
  constructor(
    private readonly webhooks: EsimAiraloWebhookService,
    private readonly config: ConfigService,
  ) {}

  @Head('low-data')
  @SkipThrottle()
  headLowData(
    @Query('token') token: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): void {
    this.assertWebhookToken(token, req);
    // Empty 200 — no JSON envelope / Content-Length body (Airalo accessibility check).
    res.status(200).end();
  }

  /** Some Airalo/scanner probes use GET; must not 404 during opt-in validation. */
  @Get('low-data')
  @SkipThrottle()
  @HttpCode(200)
  getLowData(@Query('token') token: string | undefined, @Req() req: Request) {
    this.assertWebhookToken(token, req);
    return { ok: true };
  }

  @Post('low-data')
  @HttpCode(200)
  async lowData(
    @Body() body: unknown,
    @Query('token') token: string | undefined,
    @Req() req: Request,
  ) {
    this.assertWebhookToken(token, req);
    await this.webhooks.handleLowData(body);
    // Never reveal whether ICCID matched (enumeration).
    return { ok: true };
  }

  private assertWebhookToken(queryToken: string | undefined, req: Request): void {
    const expected = (this.config.get<string>('airalo.webhookSecret') ?? '').trim();
    if (!expected) {
      // Soft mode until AIRALO_WEBHOOK_SECRET is set + re-opt-in.
      return;
    }
    const headerRaw = req.headers['x-airalo-webhook-token'];
    const headerToken = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;
    const provided = (queryToken ?? headerToken ?? '').trim();
    if (!secretsEqual(expected, provided)) {
      throw new UnauthorizedException('Invalid webhook token');
    }
  }
}

function secretsEqual(expected: string, provided: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
