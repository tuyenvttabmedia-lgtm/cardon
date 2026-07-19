import {
  AgentManualCreditCategory,
  AgentManualCreditType,
  LedgerEntryType,
  LedgerReferenceType,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ADMIN_PAGINATION_MAX } from '../../admin/entities/admin.constants';

export class AgentWalletTabQueryDto {
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

  @IsOptional()
  @IsEnum(LedgerEntryType)
  ledgerType?: LedgerEntryType;

  @IsOptional()
  @IsEnum(LedgerReferenceType)
  referenceType?: LedgerReferenceType;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  q?: string;
}

export class CreateAgentManualCreditDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  amount!: string;

  @IsEnum(AgentManualCreditCategory)
  category!: AgentManualCreditCategory;

  @IsString()
  @MinLength(3)
  @MaxLength(512)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  referenceCode?: string;
}

export class CreateAgentManualDebitDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  amount!: string;

  @IsEnum(AgentManualCreditCategory)
  category!: AgentManualCreditCategory;

  @IsString()
  @MinLength(3)
  @MaxLength(512)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  referenceCode?: string;
}

export class RejectAgentManualCreditDto {
  @IsString()
  @MinLength(3)
  @MaxLength(512)
  reason!: string;
}

export class CreateAgentDepositOnBehalfDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  amount!: string;

  @IsOptional()
  @IsIn(['SEPAY', 'MEGAPAY'])
  gateway?: 'SEPAY' | 'MEGAPAY';
}

export { AgentManualCreditType };
