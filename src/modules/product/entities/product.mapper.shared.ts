import { Decimal } from '@prisma/client/runtime/library';

export function decimalToString(value: Decimal | number | string): string {
  return value instanceof Decimal ? value.toFixed(2) : String(value);
}
