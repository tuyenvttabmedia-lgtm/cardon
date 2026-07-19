import { Controller, Get } from '@nestjs/common';
import { SettingsStoreService } from '../../settings/services/settings-store.service';

@Controller('payment-methods')
export class PaymentMethodsController {
  constructor(private readonly settingsStore: SettingsStoreService) {}

  @Get()
  listPaymentMethods() {
    return this.settingsStore.getPublicPaymentMethods();
  }
}
