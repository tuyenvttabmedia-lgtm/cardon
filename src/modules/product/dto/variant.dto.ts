import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsObject, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';import { ProductVariantType } from '../entities/product.constants';

export class CreateVariantDto {
  @IsString()
  @MinLength(2)
  @MaxLength(128)
  @Matches(/^[A-Z0-9_]+$/)
  sku!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @IsEnum(ProductVariantType)
  type!: ProductVariantType;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  faceValue!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  sellPrice!: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateVariantDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsEnum(ProductVariantType)
  type?: ProductVariantType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  faceValue?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  sellPrice?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
