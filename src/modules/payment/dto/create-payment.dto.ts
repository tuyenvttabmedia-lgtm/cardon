import { IsEnum, IsUUID } from 'class-validator';
import { PaymentGatewayCode } from '@prisma/client';

export class CreatePaymentDto {
  @IsUUID()
  orderId!: string;

  @IsEnum(PaymentGatewayCode)
  gateway!: PaymentGatewayCode;
}
