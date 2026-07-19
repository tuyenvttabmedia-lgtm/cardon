import { Type } from 'class-transformer';
import {
  AgentStatus,
  FulfillmentStatus,
  OrderPaymentStatus,
  PaymentGatewayCode,
  PaymentRecordStatus,
  ProductVariantType,
} from '@prisma/client';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ADMIN_PAGINATION_MAX } from '../entities/admin.constants';
import type { AdminDeliveryFilter, AdminPaymentFilter } from '../utils/admin-order-filter.util';

export class AdminOrderQueryDto {
  @IsOptional()
  @IsEnum(OrderPaymentStatus)
  paymentStatus?: OrderPaymentStatus;

  /** UI filter alias: PENDING maps to WAITING_PAYMENT */
  @IsOptional()
  @IsIn(['PENDING', 'PAID', 'FAILED', 'REFUNDED'])
  paymentFilter?: AdminPaymentFilter;

  @IsOptional()
  @IsIn(['PROCESSING', 'DELIVERED', 'FAILED', 'NEED_SUPPORT'])
  deliveryStatus?: AdminDeliveryFilter;

  @IsOptional()
  @IsEnum(ProductVariantType)
  productType?: ProductVariantType;

  @IsOptional()
  @IsUUID()
  providerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  q?: string;

  @IsOptional()
  @IsEnum(FulfillmentStatus)
  fulfillmentStatus?: FulfillmentStatus;

  @IsOptional()
  @IsEnum(FulfillmentStatus)
  status?: FulfillmentStatus;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  customer?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ADMIN_PAGINATION_MAX)
  take?: number;
}

export class AdminAgentQueryDto {
  @IsOptional()
  @IsEnum(AgentStatus)
  status?: AgentStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ADMIN_PAGINATION_MAX)
  take?: number;
}

export class AdminAuditLogQueryDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  action?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ADMIN_PAGINATION_MAX)
  take?: number;
}

export class ResolvePaymentReviewDto {
  @IsIn(['approve', 'reject'])
  action!: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  @MaxLength(512)
  reason?: string;
}

export class AdminSuspendAgentDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  reason?: string;
}

export class AdminUpdateAgentDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  companyName?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  rateLimit?: number;
}

export class AdminPaymentQueryDto {
  @IsOptional()
  @IsEnum(PaymentGatewayCode)
  gateway?: PaymentGatewayCode;

  @IsOptional()
  @IsEnum(PaymentRecordStatus)
  status?: PaymentRecordStatus;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  amount?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ADMIN_PAGINATION_MAX)
  take?: number;
}

export class AdminProviderTransactionQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ADMIN_PAGINATION_MAX)
  take?: number;
}

export class OrderManualRecoveryDto {
  @IsIn(['retry', 'switch_provider', 'refund', 'mark_fulfilled'])
  action!: 'retry' | 'switch_provider' | 'refund' | 'mark_fulfilled';

  @IsOptional()
  @IsUUID()
  providerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  note?: string;
}

export class ProviderRuntimeSettingsDto {
  @IsOptional()
  maintenanceMode?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  reason?: string;

  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;
}

export class ProviderAlertSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  lowBalanceThreshold?: number;

  @IsOptional()
  alertAdminEnabled?: boolean;

  @IsOptional()
  alertTelegramEnabled?: boolean;

  @IsOptional()
  alertEmailEnabled?: boolean;
}

export class CopyOrderSerialDto {
  @IsUUID()
  cardRecordId!: string;
}
