import { AgentKycStatus, AgentStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ADMIN_PAGINATION_MAX } from '../../admin/entities/admin.constants';

export class AdminAgentCenterListQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  q?: string;

  @IsOptional()
  @IsEnum(AgentStatus)
  status?: AgentStatus;

  @IsOptional()
  @IsEnum(AgentKycStatus)
  kycStatus?: AgentKycStatus;

  @IsOptional()
  @IsIn(['B2B'])
  businessType?: string;

  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  apiEnabled?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  webhookEnabled?: boolean;

  @IsOptional()
  @IsIn(['ok', 'low', 'empty'])
  walletStatus?: 'ok' | 'low' | 'empty';

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
  @IsIn(['createdAt', 'lastActivity', 'companyName'])
  sort?: 'createdAt' | 'lastActivity' | 'companyName';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}

export class AdminAgentCenterSearchQueryDto {
  @IsString()
  @MaxLength(256)
  q!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class AdminAgentCenterStatementQueryDto {
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

export class AdminAgentCenterTabQueryDto {
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

export const ONBOARDING_QUEUE_TABS = [
  'email_pending',
  'kyc_pending',
  'submitted',
  'need_more_info',
  'approved',
  'rejected',
] as const;

export type OnboardingQueueTab = (typeof ONBOARDING_QUEUE_TABS)[number];

export class AdminAgentCenterOnboardingQueryDto extends AdminAgentCenterTabQueryDto {
  @IsOptional()
  @IsIn([...ONBOARDING_QUEUE_TABS])
  tab?: OnboardingQueueTab;
}

export class AdminAgentCenterMetaDto {
  @IsOptional()
  tags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  note?: string;
}
