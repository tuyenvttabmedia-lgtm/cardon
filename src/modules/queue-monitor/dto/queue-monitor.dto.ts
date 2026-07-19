import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { QUEUE_NAMES } from '../../../queue/queue.constants';
import { BullJobStatus, JOB_STATUS_LIST } from '../entities/queue-monitor.constants';

const SORT_VALUES = ['newest', 'oldest'] as const;
const HISTORY_RANGES = ['24h', '7d', '30d', 'custom'] as const;
const EXPORT_TYPES = ['statistics', 'jobs', 'failed', 'history'] as const;
const BULK_ACTIONS = ['retry', 'remove', 'promote'] as const;

export class QueueJobsQueryDto {
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
  @IsIn(JOB_STATUS_LIST)
  status?: BullJobStatus;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  job_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  correlation_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  request_id?: string;

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
  customer_email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  provider_transaction?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  keyword?: string;

  @IsOptional()
  @IsDateString()
  date_from?: string;

  @IsOptional()
  @IsDateString()
  date_to?: string;
}

export class QueueHistoryQueryDto {
  @IsOptional()
  @IsIn(HISTORY_RANGES)
  range?: (typeof HISTORY_RANGES)[number] = '24h';

  @IsOptional()
  @IsDateString()
  date_from?: string;

  @IsOptional()
  @IsDateString()
  date_to?: string;
}

export class QueueExportQueryDto extends QueueHistoryQueryDto {
  @IsOptional()
  @IsIn(EXPORT_TYPES)
  type?: (typeof EXPORT_TYPES)[number] = 'jobs';

  @IsOptional()
  @IsIn(JOB_STATUS_LIST)
  status?: BullJobStatus;
}

export class QueueCleanDto {
  @IsOptional()
  @IsIn(['completed', 'failed', 'delayed', 'wait', 'paused'])
  status?: 'completed' | 'failed' | 'delayed' | 'wait' | 'paused';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  grace_ms?: number = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  limit?: number = 1000;
}

export class BulkJobsDto {
  @IsIn(BULK_ACTIONS)
  action!: (typeof BULK_ACTIONS)[number];

  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(100)
  job_ids!: string[];
}

export class JobQueueQueryDto {
  @IsString()
  @IsIn(QUEUE_NAMES as unknown as string[])
  queue!: string;
}
