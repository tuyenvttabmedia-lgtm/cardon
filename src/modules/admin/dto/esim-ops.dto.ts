import { Transform, Type } from 'class-transformer';
import { FulfillmentStatus, OrderPaymentStatus, PaymentRecordStatus } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class EsimOpsDashboardQueryDto {
  @IsOptional()
  @IsIn(['VN', 'INTL'])
  market?: 'VN' | 'INTL';

  @IsOptional()
  @IsIn(['VND', 'USD'])
  currency?: 'VND' | 'USD';

  @IsOptional()
  @IsIn(['PAYPAL', 'SEPAY'])
  gateway?: 'PAYPAL' | 'SEPAY';

  @IsOptional()
  @IsEnum(OrderPaymentStatus)
  paymentStatus?: OrderPaymentStatus;

  @IsOptional()
  @IsIn(['today', '7d', '30d'])
  preset?: 'today' | '7d' | '30d';

  @IsOptional()
  @IsString()
  @Matches(ISO_DATE)
  from?: string;

  @IsOptional()
  @IsString()
  @Matches(ISO_DATE)
  to?: string;
}

export class EsimOpsOrderQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  q?: string;

  @IsOptional()
  @IsEnum(OrderPaymentStatus)
  paymentStatus?: OrderPaymentStatus;

  @IsOptional()
  @IsEnum(FulfillmentStatus)
  fulfillmentStatus?: FulfillmentStatus;

  @IsOptional()
  @IsIn(['today', '7d', '30d'])
  preset?: 'today' | '7d' | '30d';

  @IsOptional()
  @IsString()
  @Matches(ISO_DATE)
  from?: string;

  @IsOptional()
  @IsString()
  @Matches(ISO_DATE)
  to?: string;

  @IsOptional()
  @IsIn(['commerce', 'sandbox'])
  lane?: 'commerce' | 'sandbox';

  @IsOptional()
  @IsIn(['VN', 'INTL'])
  market?: 'VN' | 'INTL';

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  paidUnfulfilled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;
}

export class EsimOpsPaymentQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  q?: string;

  @IsOptional()
  @IsIn(['PAYPAL', 'SEPAY'])
  gateway?: 'PAYPAL' | 'SEPAY';

  @IsOptional()
  @IsIn(['VND', 'USD'])
  currency?: 'VND' | 'USD';

  @IsOptional()
  @IsEnum(PaymentRecordStatus)
  status?: PaymentRecordStatus;

  @IsOptional()
  @IsIn(['today', '7d', '30d'])
  preset?: 'today' | '7d' | '30d';

  @IsOptional()
  @IsString()
  @Matches(ISO_DATE)
  from?: string;

  @IsOptional()
  @IsString()
  @Matches(ISO_DATE)
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;
}

export class EsimOpsAttemptQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  q?: string;

  @IsOptional()
  @IsIn(['SENT', 'UNCONFIRMED', 'CONFIRMED_CREATED', 'CONFIRMED_NOT_CREATED', 'REJECTED_DEFINITIVE', 'PROFILE_SAVED'])
  outcome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  provider?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;
}

export class AdminEsimTestOrderDto {
  @IsUUID()
  variantId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  paymentMethodCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  market?: string;

  /** Sandbox charge in USD. Omitted means 1.00. Not an adminTest flag. */
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  })
  @IsString()
  @Matches(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/)
  testAmountUsd?: string;
}
