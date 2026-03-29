/** Local wall-clock HH:mm (24h), e.g. "08:00" or "9:05" */
const LOCAL_TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export function parseLocalTimeHHmm(s: string): { hour: number; minute: number } | null {
  const m = String(s).trim().match(LOCAL_TIME_RE);
  if (!m) return null;
  return { hour: parseInt(m[1], 10), minute: parseInt(m[2], 10) };
}

/** Canonical "HH:mm" for storage and APIs. */
export function normalizeLocalTimeHHmm(s: string): string | null {
  const p = parseLocalTimeHHmm(s);
  if (!p) return null;
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

export function isValidIanaTimeZone(tz: string): boolean {
  if (!tz || tz.length > 100) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function part(parts: Intl.DateTimeFormatPart[], type: string): string {
  return parts.find((p) => p.type === type)?.value ?? '0';
}

/**
 * Calendar date (YYYY-MM-DD) and clock (hour, minute) in the given IANA zone.
 */
export function getZonedCalendarDateAndClock(
  now: Date,
  timeZone: string,
): { dateStr: string; hour: number; minute: number } {
  const dFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const tFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const d = dFmt.formatToParts(now);
  const t = tFmt.formatToParts(now);
  return {
    dateStr: `${part(d, 'year')}-${part(d, 'month')}-${part(d, 'day')}`,
    hour: parseInt(part(t, 'hour'), 10),
    minute: parseInt(part(t, 'minute'), 10),
  };
}

/**
 * True when `now` is exactly the user's chosen local minute and we have not run yet on that local calendar day.
 */
export function shouldRunUserDailyCheck(
  now: Date,
  dailyCheckLocalTime: string,
  dailyCheckTimeZone: string,
  dailyCheckLastRunDate: string | null,
): boolean {
  const want = parseLocalTimeHHmm(dailyCheckLocalTime);
  if (!want) return false;
  const { dateStr, hour, minute } = getZonedCalendarDateAndClock(now, dailyCheckTimeZone);
  if (hour !== want.hour || minute !== want.minute) return false;
  if (dailyCheckLastRunDate === dateStr) return false;
  return true;
}
