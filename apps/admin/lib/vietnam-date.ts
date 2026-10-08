const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` in Asia/Ho_Chi_Minh, not the UTC date from toISOString. */
export function vietnamCalendarDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function shiftVietnamDate(day: string, days: number): string {
  const start = new Date(`${day.slice(0, 10)}T00:00:00+07:00`);
  return vietnamCalendarDate(new Date(start.getTime() + days * DAY_MS));
}
