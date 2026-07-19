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
import {
  SystemActivityEventCategory,
  SystemActivityEventType,
  SystemActivitySeverity,
  SystemActivitySource,
  UserRole,
} from '@prisma/client';
import { ActivityEventPayload } from '../../activity-event/interfaces/activity-event.interface';

const SORT_VALUES = ['newest', 'oldest'] as const;

export class ActivityLogQueryDto {
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
  severity?: SystemActivitySeverity;

  @IsOptional()
  @IsString()
  category?: SystemActivityEventCategory;

  @IsOptional()
  @IsString()
  source?: SystemActivitySource;

  @IsOptional()
  @IsString()
  event?: SystemActivityEventType;

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

export type CreateActivityLogDto = ActivityEventPayload;

export interface ActivityLogStats {
  today: number;
  yesterday: number;
  thisWeek: number;
  total: number;
}
