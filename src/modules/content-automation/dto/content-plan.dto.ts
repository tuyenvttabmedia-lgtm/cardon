import {
  ContentPlanAction,
  ContentPlanContentType,
  ContentPlanSearchIntent,
  ContentPlanStatus,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
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
import { CONTENT_PLAN_PRIORITY } from '../entities/content-automation.constants';

export class CreateContentPlanDto {
  @IsString()
  @MinLength(2)
  @MaxLength(512)
  topic!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(256)
  primaryKeyword!: string;

  @IsEnum(ContentPlanSearchIntent)
  searchIntent!: ContentPlanSearchIntent;

  @IsEnum(ContentPlanContentType)
  contentType!: ContentPlanContentType;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  audience?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  businessObjective?: string;

  @IsOptional()
  @IsIn(Object.values(CONTENT_PLAN_PRIORITY))
  priority?: (typeof CONTENT_PLAN_PRIORITY)[keyof typeof CONTENT_PLAN_PRIORITY];

  @IsOptional()
  @IsString()
  @MaxLength(255)
  suggestedTitle?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(128, { each: true })
  supportingKeywords?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(512)
  angle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminNotes?: string;
}

export class UpdateContentPlanDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(512)
  topic?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  primaryKeyword?: string;

  @IsOptional()
  @IsEnum(ContentPlanSearchIntent)
  searchIntent?: ContentPlanSearchIntent;

  @IsOptional()
  @IsEnum(ContentPlanContentType)
  contentType?: ContentPlanContentType;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  audience?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  businessObjective?: string | null;

  @IsOptional()
  @IsIn(Object.values(CONTENT_PLAN_PRIORITY))
  priority?: (typeof CONTENT_PLAN_PRIORITY)[keyof typeof CONTENT_PLAN_PRIORITY];

  @IsOptional()
  @IsString()
  @MaxLength(255)
  suggestedTitle?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(128, { each: true })
  supportingKeywords?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(512)
  angle?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminNotes?: string | null;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  factVariantIds?: string[];

  @IsOptional()
  @IsEnum(ContentPlanAction)
  action?: ContentPlanAction;
}

export class ListContentPlansQueryDto {
  @IsOptional()
  @IsEnum(ContentPlanStatus)
  status?: ContentPlanStatus;

  @IsOptional()
  @IsEnum(ContentPlanContentType)
  contentType?: ContentPlanContentType;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class RejectContentDto {
  @IsOptional()
  @IsIn(['re-write', 're-outline'])
  mode?: 're-write' | 're-outline';
}

export class CreateCmsDraftDto {
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class InternalLinkCandidatesQueryDto {
  @IsOptional()
  @IsUUID()
  planId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  keyword?: string;

  @IsOptional()
  @IsUUID()
  excludePageId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}
