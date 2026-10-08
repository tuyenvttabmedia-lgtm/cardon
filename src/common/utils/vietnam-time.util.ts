const DAY_MS = 24 * 60 * 60 * 1000;

/** Calendar day in Vietnam, `YYYY-MM-DD`. Independent of the process timezone. */
export function vietnamCalendarDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function calendarDay(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  if (!match) {
    throw new Error('Invalid date');
  }
  return match[1];
}

/** Inclusive Vietnam calendar day: 00:00 ICT through the next 00:00 ICT. */
export function vietnamDayBounds(value: string): { start: Date; endExclusive: Date } {
  const start = new Date(`${calendarDay(value)}T00:00:00+07:00`);
  if (Number.isNaN(start.getTime())) {
    throw new Error('Invalid date');
  }
  return { start, endExclusive: new Date(start.getTime() + DAY_MS) };
}

export function vietnamDayEndInclusive(value: string): Date {
  return new Date(vietnamDayBounds(value).endExclusive.getTime() - 1);
}

export function shiftVietnamDate(day: string, days: number): string {
  const { start } = vietnamDayBounds(day);
  return vietnamCalendarDate(new Date(start.getTime() + days * DAY_MS));
}

export function startOfVietnamToday(): Date {
  return vietnamDayBounds(vietnamCalendarDate()).start;
}

export function startOfVietnamMonth(date = new Date()): Date {
  const day = vietnamCalendarDate(date);
  return vietnamDayBounds(`${day.slice(0, 8)}01`).start;
}

export function startOfVietnamDaysAgo(days: number): Date {
  return vietnamDayBounds(shiftVietnamDate(vietnamCalendarDate(), -days)).start;
}
