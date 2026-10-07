import { BadRequestException } from '@nestjs/common';
import { FINANCE_MAX_DATE_RANGE_DAYS } from '../entities/finance.constants';

export function assertFinanceDateRange(dateFrom: string, dateTo: string): {
  from: Date;
  to: Date;
} {
  const from = new Date(dateFrom);
  const to = new Date(dateTo);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new BadRequestException('Invalid date range');
  }

  if (to < from) {
    throw new BadRequestException('dateTo must be on or after dateFrom');
  }

  const maxMs = FINANCE_MAX_DATE_RANGE_DAYS * 24 * 60 * 60 * 1000;
  if (to.getTime() - from.getTime() > maxMs) {
    throw new BadRequestException(
      `Date range cannot exceed ${FINANCE_MAX_DATE_RANGE_DAYS} days`,
    );
  }

  return { from, to };
}

const VN_DAY_MS = 24 * 60 * 60 * 1000;

function calendarDay(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  if (!match) {
    throw new BadRequestException('Invalid date range');
  }
  return match[1];
}

/**
 * Inclusive Vietnam calendar days. `toExclusive` is 00:00 ICT on the day after `dateTo`.
 * Date-only strings are not UTC midnights: 2026-10-06 must include 6 Oct ICT and exclude 7 Oct 00:46 ICT.
 */
export function vietnamCalendarRange(dateFrom: string, dateTo: string): {
  from: Date;
  toExclusive: Date;
} {
  assertFinanceDateRange(dateFrom, dateTo);
  const from = new Date(`${calendarDay(dateFrom)}T00:00:00+07:00`);
  const toExclusive = new Date(new Date(`${calendarDay(dateTo)}T00:00:00+07:00`).getTime() + VN_DAY_MS);
  if (Number.isNaN(from.getTime()) || Number.isNaN(toExclusive.getTime()) || toExclusive <= from) {
    throw new BadRequestException('Invalid date range');
  }
  return { from, toExclusive };
}
