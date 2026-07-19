import { BadRequestException } from '@nestjs/common';

export function validateCardProviderExecution(params: {
  providerProductCode: string;
}): void {
  if (!params.providerProductCode?.trim()) {
    throw new BadRequestException('CARD fulfillment requires providerProductCode');
  }
}

export function validateTopupProviderExecution(params: {
  phoneNumber: string;
  amount: number;
  telco: string;
  providerProductCode: string;
}): void {
  if (!params.providerProductCode?.trim()) {
    throw new BadRequestException('TOPUP fulfillment requires providerProductCode');
  }
  if (!params.phoneNumber?.trim()) {
    throw new BadRequestException('TOPUP fulfillment requires phoneNumber');
  }
  if (!Number.isFinite(params.amount) || params.amount <= 0) {
    throw new BadRequestException('TOPUP fulfillment requires a valid amount');
  }
  if (!params.telco?.trim()) {
    throw new BadRequestException('TOPUP fulfillment requires telco');
  }
}

export function validateDataProviderExecution(params: {
  phoneNumber: string;
  packageCode: string;
  providerProductCode: string;
}): void {
  if (!params.providerProductCode?.trim()) {
    throw new BadRequestException('DATA fulfillment requires providerProductCode');
  }
  if (!params.phoneNumber?.trim()) {
    throw new BadRequestException('DATA fulfillment requires phoneNumber');
  }
  if (!params.packageCode?.trim()) {
    throw new BadRequestException('DATA fulfillment requires packageCode');
  }
}
