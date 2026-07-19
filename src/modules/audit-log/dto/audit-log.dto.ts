import { SystemAuditAction, SystemAuditResource, UserRole } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const SORT_VALUES = ['newest', 'oldest'] as const;

export class AuditLogQueryDto {
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

  @IsOptional()
  @IsIn(SORT_VALUES)
  sort?: (typeof SORT_VALUES)[number] = 'newest';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  keyword?: string;

  @IsOptional()
  @IsString()
  resource?: SystemAuditResource;

  @IsOptional()
  @IsString()
  action?: SystemAuditAction;

  @IsOptional()
  @IsUUID()
  user?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  role?: UserRole;

  @IsOptional()
  @IsDateString()
  date_from?: string;

  @IsOptional()
  @IsDateString()
  date_to?: string;
}

export class CreateSystemAuditLogDto {
  resource!: SystemAuditResource;
  resourceId?: string | null;
  resourceName?: string | null;
  action!: SystemAuditAction;
  fieldName?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  performedBy!: string;
  performedEmail!: string;
  performedRole!: UserRole;
  ipAddress?: string | null;
  userAgent?: string | null;
  sessionId?: string | null;
  correlationId?: string | null;
  reason?: string | null;
}
