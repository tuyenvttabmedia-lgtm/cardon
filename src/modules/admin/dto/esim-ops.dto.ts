import { Transform, Type } from 'class-transformer';
import { FulfillmentStatus, OrderPaymentStatus } from '@prisma/client';
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
}
