import { Type } from 'class-transformer';
import { HomeServiceType } from '@prisma/client';
import { IsIn, IsNumber, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ServiceMarginRuleDto {
  @IsIn(['PERCENT', 'FIXED'])
  marginType!: 'PERCENT' | 'FIXED';

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100_000_000)
  value!: number;
}

export class UpdateAgentMarginConfigDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  roundTo?: number;

  @IsOptional()
  @IsObject()
  services?: Partial<Record<HomeServiceType, ServiceMarginRuleDto>>;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  reason?: string;
}
