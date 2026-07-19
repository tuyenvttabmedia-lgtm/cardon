import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { WEBHOOK_DELIVERY_STATUS, WebhookDeliveryStatus } from '../entities/webhook-delivery.constants';

const DELIVERY_STATUSES = Object.values(WEBHOOK_DELIVERY_STATUS);

export class WebhookDeliveryListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsIn(DELIVERY_STATUSES)
  status?: WebhookDeliveryStatus;

  @IsOptional()
  @IsString()
  event?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  httpStatus?: number;

  @IsOptional()
  @IsString()
  tab?: 'history' | 'failed' | 'retry';

  @IsOptional()
  @IsString()
  gateway?: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;
}
