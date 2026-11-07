import { IsEmail, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaymentGatewayCode } from '@prisma/client';

export class CreatePaymentDto {
  @IsUUID()
  orderId!: string;

  @IsEnum(PaymentGatewayCode)
  gateway!: PaymentGatewayCode;

  /** Required for guest orders — must match orders.guest_email. */
  @IsOptional()
  @IsEmail()
  guestEmail?: string;
}
