import {
  RefundAttemptStatus,
  RefundCurrency,
  RefundEsimGate,
  RefundIntendedMethod,
  RefundReconStatus,
  RefundRequestStatus,
} from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
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
  MinLength,
} from 'class-validator';
import { ADMIN_PAGINATION_MAX } from '../entities/admin.constants';
import {
  SAFE_FAIL_ERROR_CODES,
  SAFE_UNCONFIRMED_ERROR_CODES,
} from '../entities/refund-payout.rules';

function toOptionalBoolean(value: unknown): boolean | undefined {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return undefined;
}

export class CreateRefundRequestDto {
  @IsUUID()
  paymentId!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  amount!: string;

  @IsOptional()
  @IsEnum(RefundCurrency)
  currency?: RefundCurrency;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(512)
  reason!: string;

  @IsOptional()
  @IsEnum(RefundIntendedMethod)
  intendedMethod?: RefundIntendedMethod;
}

export class ExecuteRefundRequestDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  amount?: string;
}

export class CompleteRefundAttemptDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  bankTransactionReference!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  amount!: string;

  @IsEnum(RefundCurrency)
  currency!: RefundCurrency;

  @IsDateString()
  transferredAt!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(128)
  destinationHint!: string;
}

export class FailRefundAttemptDto {
  @IsIn(SAFE_FAIL_ERROR_CODES)
  errorCode!: (typeof SAFE_FAIL_ERROR_CODES)[number];

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(128)
  errorMessage?: string;
}

export class UnconfirmRefundAttemptDto {
  @IsOptional()
  @IsIn(SAFE_UNCONFIRMED_ERROR_CODES)
  errorCode?: (typeof SAFE_UNCONFIRMED_ERROR_CODES)[number];
}

export class ReconcileRefundAttemptDto {
  @IsIn([RefundReconStatus.VERIFIED, RefundReconStatus.REJECTED])
  decision!: Extract<RefundReconStatus, 'VERIFIED' | 'REJECTED'>;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  statementEvidenceRef!: string;
}

export class AdminRefundRequestQueryDto {
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsOptional()
  @IsUUID()
  paymentId?: string;

  @IsOptional()
  @IsEnum(RefundRequestStatus)
  requestStatus?: RefundRequestStatus;

  @IsOptional()
  @IsEnum(RefundAttemptStatus)
  attemptStatus?: RefundAttemptStatus;

  @IsOptional()
  @IsEnum(RefundEsimGate)
  esimGate?: RefundEsimGate;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  needsAction?: boolean;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(64)
  q?: string;

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
