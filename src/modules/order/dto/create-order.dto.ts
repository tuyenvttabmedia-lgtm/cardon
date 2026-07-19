import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
  Allow,
} from 'class-validator';

export class CreateOrderItemDto {
  @IsUUID()
  variantId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  guestEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  guestPhone?: string;

  @IsOptional()
  @IsBoolean()
  invoiceRequired?: boolean;

  @ValidateIf((dto: CreateOrderDto) => dto.invoiceRequired === true)
  @IsString()
  @MaxLength(255)
  companyName?: string;

  @ValidateIf((dto: CreateOrderDto) => dto.invoiceRequired === true)
  @IsString()
  @MaxLength(64)
  taxCode?: string;

  @ValidateIf((dto: CreateOrderDto) => dto.invoiceRequired === true)
  @IsString()
  @MaxLength(512)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  customerNote?: string;

  /** Device hints from browser — IP/UA captured server-side. */
  @IsOptional()
  @Allow()
  clientDeviceInfo?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  paymentMethodCode?: string;
}
