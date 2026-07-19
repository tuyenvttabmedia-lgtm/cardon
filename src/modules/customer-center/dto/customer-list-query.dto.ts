import { Type } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, IsIn, IsInt, Max, Min } from 'class-validator';

export class CustomerOrderListQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsIn(['all', 'processing', 'completed'])
  tab?: 'all' | 'processing' | 'completed';

  @IsOptional()
  @IsIn(['CARD', 'TOPUP', 'DATA'])
  type?: 'CARD' | 'TOPUP' | 'DATA';

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;
}

export class CustomerPinListQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  product?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;
}

export class CustomerNotificationQueryDto {
  @IsOptional()
  @IsIn(['all', 'order', 'pin', 'promo', 'system'])
  group?: 'all' | 'order' | 'pin' | 'promo' | 'system';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;
}

export class CustomerSearchQueryDto {
  @IsString()
  @IsNotEmpty()
  q!: string;
}
