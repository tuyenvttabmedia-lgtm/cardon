import { Controller, Get } from '@nestjs/common';
import { Public } from '../decorators/public.decorator';
import { SettingsStoreService } from '../../modules/settings/services/settings-store.service';

/**
 * Public Turnstile site key for storefront widgets.
 * Never returns secret. Empty when disabled / incomplete.
 */
@Controller('public/turnstile')
export class TurnstilePublicController {
  constructor(private readonly settingsStore: SettingsStoreService) {}

  @Public()
  @Get()
  getPublicClient() {
    return this.settingsStore.getTurnstilePublicClient();
  }
}
