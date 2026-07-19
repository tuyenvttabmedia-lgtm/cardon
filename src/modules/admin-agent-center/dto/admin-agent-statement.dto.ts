import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class AgentStatementPeriodQueryDto {
  @IsOptional()
  @IsIn(['today', 'last_7_days', 'this_month', 'last_month', 'custom'])
  preset?: 'today' | 'last_7_days' | 'this_month' | 'last_month' | 'custom';

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;
}

export class AgentStatementOrdersQueryDto extends AgentStatementPeriodQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  skip?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  take?: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  q?: string;
}

export class GenerateAgentStatementDto extends AgentStatementPeriodQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  reason?: string;
}

export class CreateAgentStatementAdjustmentDto {
  @Type(() => Number)
  @IsNumber()
  amount!: number;

  @IsString()
  @MaxLength(512)
  reason!: string;

  @IsOptional()
  @IsUUID()
  statementId?: string;

  @IsOptional()
  @Type(() => Boolean)
  applyToWallet?: boolean;
}

export class AgentStatementExportQueryDto extends AgentStatementPeriodQueryDto {
  @IsOptional()
  @IsIn(['csv', 'excel', 'pdf'])
  format?: 'csv' | 'excel' | 'pdf';

  @IsOptional()
  @IsUUID()
  statementId?: string;
}

export class AgentAdjustmentsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  skip?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  take?: number;

  @IsOptional()
  @IsUUID()
  statementId?: string;
}

export class AgentStatementReasonDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  reason?: string;
}

export class VoidAgentInvoiceDto {
  @IsString()
  @MaxLength(512)
  reason!: string;
}

export class MarkStatementPaidDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  note?: string;
}
