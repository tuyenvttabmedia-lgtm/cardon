import { Type } from 'class-transformer';
import {
  IsArray,
  ArrayMaxSize,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaymentGatewayCode } from '@prisma/client';
import {
  FINANCE_MAX_RECONCILE_LINES,
  FINANCE_PAGINATION_MAX,
} from '../entities/finance.constants';

export class GatewayReportLineDto {
  @IsString()
  @MaxLength(128)
  transactionId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  paymentReference?: string;

  @IsString()
  @MaxLength(32)
  amount!: string;

  @IsIn(['SUCCESS', 'FAILED'])
  status!: 'SUCCESS' | 'FAILED';

  @IsDateString()
  occurredAt!: string;
}

export class PaymentReconcileDto {
  @IsEnum(PaymentGatewayCode)
  gateway!: PaymentGatewayCode;

  @IsDateString()
  reportDate!: string;

  @IsArray()
  @ArrayMaxSize(FINANCE_MAX_RECONCILE_LINES)
  @ValidateNested({ each: true })
  @Type(() => GatewayReportLineDto)
  transactions!: GatewayReportLineDto[];
}

export class ProviderReportLineDto {
  @IsString()
  @MaxLength(128)
  transactionId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsString()
  @MaxLength(32)
  cost!: string;

  @IsIn(['SUCCESS', 'FAILED'])
  status!: 'SUCCESS' | 'FAILED';

  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}

export class ProviderReconcileDto {
  @IsString()
  @MaxLength(64)
  providerCode!: string;

  @IsDateString()
  reportDate!: string;

  @IsArray()
  @ArrayMaxSize(FINANCE_MAX_RECONCILE_LINES)
  @ValidateNested({ each: true })
  @Type(() => ProviderReportLineDto)
  transactions!: ProviderReportLineDto[];
}

export class ProfitQueryDto {
  @IsDateString()
  dateFrom!: string;

  @IsDateString()
  dateTo!: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  providerId?: string;
}

export class GatewayFeesQueryDto {
  @IsDateString()
  dateFrom!: string;

  @IsDateString()
  dateTo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  gateway?: string;
}

export class PaymentSettlementQueryDto {
  @IsDateString()
  dateFrom!: string;

  @IsDateString()
  dateTo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  gateway?: string;

  @IsOptional()
  @IsIn(['DIRECT_TO_MERCHANT', 'GATEWAY_SETTLEMENT'])
  settlementType?: 'DIRECT_TO_MERCHANT' | 'GATEWAY_SETTLEMENT';
}

export class UpsertGatewayInvoiceDto {
  @IsString()
  @MaxLength(64)
  gatewayCode!: string;

  @IsString()
  @MaxLength(32)
  period!: string;

  @IsDateString()
  periodStart!: string;

  @IsDateString()
  periodEnd!: string;

  @IsInt()
  @Min(0)
  totalTransactions!: number;

  @IsString()
  @MaxLength(32)
  totalVolume!: string;

  @IsString()
  @MaxLength(32)
  totalFee!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  vatAmount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  invoiceNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  notes?: string;
}

export class AgentStatementQueryDto {
  @IsDateString()
  dateFrom!: string;

  @IsDateString()
  dateTo!: string;
}

export class CreateCustomerInvoiceDto {
  @IsUUID()
  orderId!: string;
}

export class CreateAgentInvoiceDto {
  @IsUUID()
  agentId!: string;

  @IsUUID()
  ledgerEntryId!: string;
}

export class VoidInvoiceDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  reason?: string;
}

export class FinanceListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(FINANCE_PAGINATION_MAX)
  take?: number;
}

export class ProviderReconciliationQueryDto extends FinanceListQueryDto {
  @IsOptional()
  @IsUUID()
  providerId?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

export class ProviderTransactionSearchQueryDto extends FinanceListQueryDto {
  @IsOptional()
  @IsUUID()
  providerId?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  providerTransactionId?: string;
}

export class ProviderFinanceDashboardQueryDto {
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsUUID()
  providerId?: string;
}

export class RunProviderReconciliationDto {
  @IsOptional()
  @IsUUID()
  providerId?: string;

  @IsOptional()
  @IsDateString()
  reportDate?: string;
}
