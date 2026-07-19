import { Type } from 'class-transformer';
import {
  FulfillmentStatus,
  OrderPaymentStatus,
} from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
} from 'class-validator';

export class AdminOrderQueryDto {
  @IsOptional()
  @IsEnum(OrderPaymentStatus)
  paymentStatus?: OrderPaymentStatus;

  @IsOptional()
  @IsEnum(FulfillmentStatus)
  fulfillmentStatus?: FulfillmentStatus;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @Type(() => Number)
  skip?: number;

  @IsOptional()
  @Type(() => Number)
  take?: number;
}
