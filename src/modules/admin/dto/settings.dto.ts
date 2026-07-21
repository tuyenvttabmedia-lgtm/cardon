import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class UpdatePaymentGatewayDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsIn(['sandbox', 'production'])
  environment?: 'sandbox' | 'production';

  @IsOptional()
  @IsIn(['legacy_qr', 'payment_gateway'])
  integrationMode?: 'legacy_qr' | 'payment_gateway';

  @IsOptional()
  @IsIn(['BANK_TRANSFER', 'NAPAS_BANK_TRANSFER'])
  paymentMethod?: 'BANK_TRANSFER' | 'NAPAS_BANK_TRANSFER';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  merchantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  endpoint?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  returnUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  callbackUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  webhookUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  secretKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  webhookSecret?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  bankAccount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  bankCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  accountName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  qrTemplate?: string;

  /** MegaPay PG encodeKey (V1.4.6) — separate from DepositCode 3DES when provided */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  pgEncodeKey?: string;

  @IsOptional()
  @IsIn(['sandbox', 'production'])
  pgEnvironment?: 'sandbox' | 'production';

  @IsOptional()
  @IsString()
  @MaxLength(512)
  reqDomain?: string;
}

export class UpdateProviderEsaleDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsIn(['sandbox', 'production'])
  environment?: 'sandbox' | 'production';

  @IsOptional()
  @IsString()
  @MaxLength(512)
  cardApiUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  topupApiUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  agencyCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  clientCode?: string;

  @IsOptional()
  @IsString()
  secretKey?: string;

  @IsOptional()
  @IsString()
  privateKey?: string;

  @IsOptional()
  @IsString()
  publicKey?: string;

  @IsOptional()
  @IsInt()
  @Min(1000)
  timeoutMs?: number;
}

export class UpdateSmtpSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  host?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  port?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  username?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  from?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  fromName?: string;

  @IsOptional()
  @IsBoolean()
  secure?: boolean;
}

export class TestSmtpDto {
  @IsEmail()
  to!: string;
}

export class UpdateSystemSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  siteName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  publicUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999_999_999_999)
  providerLowBalanceThreshold?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999_999_999_999)
  agentLowBalanceThreshold?: number;

  @IsOptional()
  @IsIn(['INVITE_ONLY', 'PUBLIC_APPROVAL', 'DISABLED'])
  agentRegistrationMode?: 'INVITE_ONLY' | 'PUBLIC_APPROVAL' | 'DISABLED';

  @IsOptional()
  @IsBoolean()
  customerTopupEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  customerDataEnabled?: boolean;
}

export class UpdateOrderSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999_999_999_999)
  guestMaxOrderAmount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999_999_999_999)
  customerMaxOrderAmount?: number;
}

export class UpdatePaymentRuntimeDto {
  @IsOptional()
  @IsIn(['MEGAPAY', 'SEPAY', 'PAYOS', 'VNPAY', 'MOMO', 'ZALOPAY', 'NOWPAYMENTS'])
  defaultGateway?: 'MEGAPAY' | 'SEPAY' | 'PAYOS' | 'VNPAY' | 'MOMO' | 'ZALOPAY' | 'NOWPAYMENTS';
}

export class UpdatePaymentStrategyDto {
  @IsOptional()
  @IsIn(['MEGAPAY', 'SEPAY'])
  defaultGateway?: 'MEGAPAY' | 'SEPAY';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentGatewayPriorityDto)
  gateways?: PaymentGatewayPriorityDto[];
}

export class PaymentGatewayPriorityDto {
  @IsIn(['MEGAPAY', 'SEPAY'])
  code!: 'MEGAPAY' | 'SEPAY';

  @IsInt()
  @Min(1)
  @Max(99)
  priority!: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdatePaymentGatewayRuntimeDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  priority?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  displayName?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  percentageFee?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999_999_999)
  fixedFee?: number;
}

export class UpdateTelegramSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  chatId?: string;

  @IsOptional()
  @IsString()
  botToken?: string;
}

export class PaymentMethodConfigDto {
  @IsString()
  @MaxLength(64)
  gatewayCode!: 'SEPAY' | 'MEGAPAY';

  @IsString()
  @MaxLength(64)
  methodCode!: string;

  @IsString()
  @MaxLength(255)
  displayName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  iconUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  logoUrl?: string | null;

  @IsBoolean()
  enabled!: boolean;

  @IsNumber()
  @Min(0)
  percentageFee!: number;

  @IsNumber()
  @Min(0)
  fixedFee!: number;

  @IsIn(['DIRECT_TO_MERCHANT', 'GATEWAY_SETTLEMENT'])
  settlementType!: 'DIRECT_TO_MERCHANT' | 'GATEWAY_SETTLEMENT';
}

export class UpdatePaymentMethodsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentMethodConfigDto)
  methods!: PaymentMethodConfigDto[];
}
