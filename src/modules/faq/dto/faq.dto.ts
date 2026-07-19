import { Type, Transform } from 'class-transformer';

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return undefined;
}
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { FaqCategoryStatus, FaqStatus } from '@prisma/client';

export class ListFaqAdminQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  position?: string;

  @IsOptional()
  @IsEnum(FaqStatus)
  status?: FaqStatus;

  @IsOptional()
  @Transform(({ value }) => parseOptionalBoolean(value))
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class ListFaqPublicQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  /** Category slug filter */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  category?: string;

  /** @deprecated use position — legacy alias for category=guide|contact */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  legacyCategory?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  position?: string;

  @IsOptional()
  @Transform(({ value }) => parseOptionalBoolean(value))
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class CreateFaqCategoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  icon?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsEnum(FaqCategoryStatus)
  status?: FaqCategoryStatus;
}

export class UpdateFaqCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  icon?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsEnum(FaqCategoryStatus)
  status?: FaqCategoryStatus;
}

export class CreateFaqDto {
  @IsUUID()
  categoryId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  question!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(10000)
  answer!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  slug?: string;

  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsEnum(FaqStatus)
  status?: FaqStatus;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  positions?: string[];
}

export class UpdateFaqDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  question?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(10000)
  answer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  slug?: string;

  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsEnum(FaqStatus)
  status?: FaqStatus;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  positions?: string[];
}

export class BulkFaqPatchDto {
  @IsOptional()
  @IsEnum(FaqStatus)
  status?: FaqStatus;

  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  positions?: string[];
}

export class BulkUpdateFaqDto {
  @IsArray()
  @IsUUID(undefined, { each: true })
  ids!: string[];

  @ValidateNested()
  @Type(() => BulkFaqPatchDto)
  patch!: BulkFaqPatchDto;
}
