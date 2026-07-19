import { IsEnum, IsNumber, IsOptional, Min } from 'class-validator';
import { PaymentGatewayCode } from '@prisma/client';

export class CreateAgentDepositDto {
  @IsNumber()
  @Min(10000)
  amount!: number;

  @IsOptional()
  @IsEnum(PaymentGatewayCode)
  gateway?: PaymentGatewayCode;
}
