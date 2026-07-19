import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
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
import { WebhookSource } from '@prisma/client';
import { WEBHOOK_MONITOR_SOURCES } from '../entities/webhook-monitor.constants';

const SORT_VALUES = ['newest', 'oldest'] as const;
const STATUS_VALUES = [
  'SUCCESS',
  'FAILED',
  'PENDING',
  'RETRY',
  'TIMEOUT',
  'INVALID_SIGNATURE',
  'DUPLICATE',
  'IGNORED',
] as const;
const HISTORY_RANGES = ['24h', '7d', '30d', 'custom'] as const;
const EXPORT_TYPES = ['statistics', 'webhooks', 'failed', 'history'] as const;

export class WebhookListQueryDto {
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
  @IsIn(WEBHOOK_MONITOR_SOURCES as unknown as string[])
  source?: WebhookSource;

  @IsOptional()
  @IsIn(STATUS_VALUES)
  status?: (typeof STATUS_VALUES)[number];

  @IsOptional()
  @IsDateString()
  date_from?: string;

  @IsOptional()
  @IsDateString()
  date_to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  order_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  payment_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  request_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  correlation_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  endpoint?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  http_code?: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  payment_reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  keyword?: string;
}

export class WebhookHistoryQueryDto {
  @IsOptional()
  @IsIn(HISTORY_RANGES)
  range?: (typeof HISTORY_RANGES)[number] = '24h';

  @IsOptional()
  @IsDateString()
  date_from?: string;

  @IsOptional()
  @IsDateString()
  date_to?: string;

  @IsOptional()
  @IsIn(WEBHOOK_MONITOR_SOURCES as unknown as string[])
  source?: WebhookSource;
}

export class WebhookExportQueryDto extends WebhookHistoryQueryDto {
  @IsOptional()
  @IsIn(EXPORT_TYPES)
  type?: (typeof EXPORT_TYPES)[number] = 'webhooks';

  @IsOptional()
  @IsIn(STATUS_VALUES)
  status?: (typeof STATUS_VALUES)[number];
}

export class WebhookCancelDto {
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(100)
  ids!: string[];
}

export class WebhookRetryBulkDto {
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(100)
  ids?: string[];
}
