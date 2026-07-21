import { Type, Transform } from 'class-transformer';
import {
  IsBoolean,
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
import {
  SystemNotificationSeverity,
  SystemNotificationType,
  SystemActivitySource,
} from '@prisma/client';

const SORT_VALUES = ['newest', 'oldest'] as const;

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return undefined;
}

export class SystemNotificationQueryDto {
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
  severity?: SystemNotificationSeverity;

  @IsOptional()
  @IsString()
  type?: SystemNotificationType;

  @IsOptional()
  @IsString()
  source?: SystemActivitySource;

  @IsOptional()
  @Transform(({ value }) => parseOptionalBoolean(value))
  @IsBoolean()
  is_read?: boolean;

  @IsOptional()
  @IsIn(['all', 'unread', 'warnings', 'critical'])
  tab?: 'all' | 'unread' | 'warnings' | 'critical';

  @IsOptional()
  @IsDateString()
  date_from?: string;

  @IsOptional()
  @IsDateString()
  date_to?: string;
}

export class BulkMarkReadDto {
  @IsOptional()
  @IsUUID(undefined, { each: true })
  ids?: string[];
}

export class BulkDismissDto {
  @IsOptional()
  @IsUUID(undefined, { each: true })
  ids?: string[];
}
