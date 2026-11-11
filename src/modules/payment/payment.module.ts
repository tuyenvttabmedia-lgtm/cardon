import { Module, forwardRef } from '@nestjs/common';
import { ActivityEventModule } from '../activity-event/activity-event.module';
import { AuthModule } from '../auth/auth.module';
import { OrderModule } from '../order/order.module';
import { NotificationModule } from '../notification/notification.module';
import { MaintenanceCenterModule } from '../maintenance-center/maintenance-center.module';
import { ProviderModule } from '../provider/provider.module';
import { PaymentController } from './controllers/payment.controller';
import { PaymentMethodsController } from './controllers/payment-methods.controller';
import { MegapayConfigService } from './providers/megapay/megapay.config';
import { DepositCodeHttpClient } from './providers/megapay/depositcode.client';
import { MegapayPgHttpClient } from './providers/megapay/megapay-pg.client';
import { MegaPayProvider } from './providers/megapay/megapay.provider';
import { PaypalProvider } from './providers/paypal/paypal.provider';
import { SePayProvider } from './providers/sepay/sepay.provider';
import { SepayConfigService } from './providers/sepay/sepay.config';
import { PaymentProviderRegistry } from './providers/payment-provider.registry';
import {
  PaymentRepository,
  WebhookLogRepository,
} from './repositories/payment.repository';
import { ExpirationCronService } from './services/expiration-cron.service';
import { PaymentAuditService } from './services/payment-audit.service';
import { PaymentExpirationService } from './services/payment-expiration.service';
import { PaymentService } from './services/payment.service';
import { EsimSepayPaymentService } from './services/esim-sepay-payment.service';
import { EsimPaypalPaymentService } from './services/esim-paypal-payment.service';
import { EsimMegapayPaymentService } from './services/esim-megapay-payment.service';

@Module({
  imports: [
    AuthModule,
    OrderModule,
    NotificationModule,
    ActivityEventModule,
    MaintenanceCenterModule,
    forwardRef(() => ProviderModule),
  ],
  controllers: [PaymentController, PaymentMethodsController],
  providers: [
    PaymentRepository,
    WebhookLogRepository,
    MegapayConfigService,
    DepositCodeHttpClient,
    MegapayPgHttpClient,
    MegaPayProvider,
    SepayConfigService,
    SePayProvider,
    PaypalProvider,
    PaymentProviderRegistry,
    PaymentService,
    EsimSepayPaymentService,
    EsimPaypalPaymentService,
    EsimMegapayPaymentService,
    PaymentAuditService,
    PaymentExpirationService,
    ExpirationCronService,
  ],
  exports: [PaymentService, PaymentExpirationService, PaymentProviderRegistry, WebhookLogRepository],
})
export class PaymentModule {}
