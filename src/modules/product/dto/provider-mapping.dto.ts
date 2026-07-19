import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { ProviderProductMappingStatus } from '@prisma/client';

export class CreateProviderMappingDto {
  @IsUUID()
  providerId!: string;

  @IsString()
  @MaxLength(128)
  providerProductCode!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  providerCost!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsEnum(ProviderProductMappingStatus)
  status?: ProviderProductMappingStatus;
}

export class UpdateProviderMappingDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  providerProductCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  providerCost?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsEnum(ProviderProductMappingStatus)
  status?: ProviderProductMappingStatus;
}
