import { BadRequestException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';

/** Minimum manual wallet credit (10.000đ). */
export const VND_MIN_WALLET_CREDIT = 10_000;

/** Max digits-safe VND amount (~999 tỷ). */
export const VND_MAX_AMOUNT = 999_999_999_999;

/** ACCOUNTANT single transaction without approval. */
export const WALLET_ACCOUNTANT_SINGLE_LIMIT = 50_000_000;

/** Amount above this for ACCOUNTANT → pending approval. */
export const WALLET_APPROVAL_THRESHOLD = 50_000_000;

/** ACCOUNTANT daily manual credit cap. */
export const WALLET_ACCOUNTANT_DAILY_LIMIT = 200_000_000;

export function parseVndAmount(raw: string): Decimal {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) {
    throw new BadRequestException('Số tiền không hợp lệ');
  }
  const n = BigInt(digits);
  if (n > BigInt(VND_MAX_AMOUNT)) {
    throw new BadRequestException(`Số tiền vượt quá ${VND_MAX_AMOUNT.toLocaleString('vi-VN')} đ`);
  }
  return new Decimal(digits);
}

export function assertVndAmountRange(
  amount: Decimal,
  min = VND_MIN_WALLET_CREDIT,
  max = new Decimal(VND_MAX_AMOUNT),
) {
  if (!amount.isInteger()) {
    throw new BadRequestException('Số tiền phải là số nguyên (VNĐ)');
  }
  if (amount.lt(min)) {
    throw new BadRequestException(`Số tiền tối thiểu ${min.toLocaleString('vi-VN')} đ`);
  }
  if (amount.gt(max)) {
    throw new BadRequestException('Số tiền vượt giới hạn cho phép');
  }
}
