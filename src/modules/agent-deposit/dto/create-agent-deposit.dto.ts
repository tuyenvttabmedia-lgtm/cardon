import { IsEnum, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { PaymentGatewayCode } from '@prisma/client';
import {
  ABSOLUTE_MAX_DEPOSIT_AMOUNT,
  ABSOLUTE_MIN_DEPOSIT_AMOUNT,
} from '../entities/deposit.constants';

export class CreateAgentDepositDto {
  /** Absolute bounds; runtime min/max come from Admin system settings. */
  @IsNumber()
  @Min(ABSOLUTE_MIN_DEPOSIT_AMOUNT)
  @Max(ABSOLUTE_MAX_DEPOSIT_AMOUNT)
  amount!: number;

  @IsOptional()
  @IsEnum(PaymentGatewayCode)
  gateway?: PaymentGatewayCode;
}
