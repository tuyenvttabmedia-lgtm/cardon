import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
  Allow,
} from 'class-validator';

/** Align with agent-api buy card Max(100); prevents unbounded provider / payment load. */
export const RETAIL_ORDER_MAX_QUANTITY_PER_LINE = 100;
export const RETAIL_ORDER_MAX_LINE_ITEMS = 20;

export class CreateOrderItemDto {
  @IsUUID()
  variantId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(RETAIL_ORDER_MAX_QUANTITY_PER_LINE)
  quantity!: number;
}

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(RETAIL_ORDER_MAX_LINE_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  guestEmail?: string;

  /** Cloudflare Turnstile — required for guest when TURNSTILE_ENABLED=true. */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  captchaToken?: string;

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

  /** eSIM market lane: VN (VND+SePay) or INTL (USD+PayPal). Ignored for cards/topup. */
  @IsOptional()
  @IsString()
  @MaxLength(8)
  market?: string;

  /** Customer language for emails. Does not change price, payment, or fulfillment. */
  @IsOptional()
  @IsIn(['vi', 'en'])
  locale?: 'vi' | 'en';
}
