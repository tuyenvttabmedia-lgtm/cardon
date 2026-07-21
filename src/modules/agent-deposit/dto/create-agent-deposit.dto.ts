import { IsEnum, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { PaymentGatewayCode } from '@prisma/client';
import {
  MAX_DEPOSIT_AMOUNT,
  MIN_DEPOSIT_AMOUNT,
} from '../entities/deposit.constants';

export class CreateAgentDepositDto {
  @IsNumber()
  @Min(MIN_DEPOSIT_AMOUNT)
  @Max(MAX_DEPOSIT_AMOUNT)
  amount!: number;

  @IsOptional()
  @IsEnum(PaymentGatewayCode)
  gateway?: PaymentGatewayCode;
}
