/**
 * Time in a church's timezone.
 *
 * Gatherings are stored as UTC instants plus the church's IANA timezone.
 * Everything a person sees (the day a gathering falls on, its start time)
 * and everything a person types (a date and a clock time on a form) is in
 * that timezone, never the server's (UTC on Vercel) or the browser's.
 *
 * Pure functions over Intl, so they run the same in a server component, a
 * client component, and a test.
 */

const DEFAULT_LOCALE = 'en-US';

function parts(iso: string | Date, timeZone: string): Record<string, string> {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d)) {
    out[p.type] = p.value;
  }
  return out;
}

/** 'YYYY-MM-DD' for the calendar day the instant falls on in `timeZone`. */
export function dayKeyInZone(iso: string | Date, timeZone: string): string {
  const p = parts(iso, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** 'HH:mm' (24h) wall-clock time of the instant in `timeZone`. */
export function clockInZone(iso: string | Date, timeZone: string): string {
  const p = parts(iso, timeZone);
  return `${p.hour}:${p.minute}`;
}

/** Year and 1-based month of the instant in `timeZone`. */
export function yearMonthInZone(iso: string | Date, timeZone: string): { year: number; month: number } {
  const p = parts(iso, timeZone);
  return { year: Number(p.year), month: Number(p.month) };
}

export function formatTimeInZone(iso: string, timeZone: string, locale = DEFAULT_LOCALE): string {
  return new Date(iso).toLocaleTimeString(locale, { timeZone, hour: 'numeric', minute: '2-digit' });
}

export function formatDateInZone(
  iso: string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' },
  locale = DEFAULT_LOCALE,
): string {
  return new Date(iso).toLocaleDateString(locale, { ...options, timeZone });
}

/** "Tuesday, October 13, 2026 at 7:00 PM CDT", in `timeZone`. */
export function formatDateTimeInZone(iso: string, timeZone: string, locale = DEFAULT_LOCALE): string {
  const date = formatDateInZone(iso, timeZone, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }, locale);
  return `${date} at ${formatTimeInZone(iso, timeZone, locale)} ${zoneAbbreviation(iso, timeZone, locale)}`;
}

/** "Oct 13, 7:00 PM", in `timeZone`. */
export function formatShortDateTimeInZone(iso: string, timeZone: string, locale = DEFAULT_LOCALE): string {
  return `${formatDateInZone(iso, timeZone, { month: 'short', day: 'numeric' }, locale)}, ${formatTimeInZone(iso, timeZone, locale)}`;
}

/** Short zone label such as "CDT", for showing next to a time. */
export function zoneAbbreviation(iso: string, timeZone: string, locale = DEFAULT_LOCALE): string {
  const p = new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'short' })
    .formatToParts(new Date(iso))
    .find((x) => x.type === 'timeZoneName');
  return p?.value ?? timeZone;
}

/** Offset of `timeZone` from UTC at `instant`, in minutes (CDT → -300). */
function offsetMinutes(instant: Date, timeZone: string): number {
  const p = parts(instant, timeZone);
  const asUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour), Number(p.minute), Number(p.second),
  );
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/**
 * The UTC instant for a wall-clock date and time in `timeZone`.
 * `date` is 'YYYY-MM-DD', `time` is 'HH:mm'. Handles DST: the offset is
 * taken at the target instant, iterated once to settle across a change.
 * Returns null for malformed input.
 */
export function zonedWallTimeToUtc(date: string, time: string, timeZone: string): Date | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!dm || !tm) return null;
  const [y, mo, d] = [Number(dm[1]), Number(dm[2]), Number(dm[3])];
  const [h, mi] = [Number(tm[1]), Number(tm[2])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;

  const naive = Date.UTC(y, mo - 1, d, h, mi);
  let guess = new Date(naive - offsetMinutes(new Date(naive), timeZone) * 60000);
  guess = new Date(naive - offsetMinutes(guess, timeZone) * 60000);
  return guess;
}

/** Adds whole days to a 'YYYY-MM-DD' date string. */
export function addDaysToDateKey(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/** The [from, to) UTC window of a calendar month in `timeZone`. */
export function monthWindowInZone(year: number, month: number, timeZone: string): { from: string; to: string } {
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextY = month === 12 ? year + 1 : year;
  const nextM = month === 12 ? 1 : month + 1;
  const next = `${nextY}-${String(nextM).padStart(2, '0')}-01`;
  return {
    from: (zonedWallTimeToUtc(first, '00:00', timeZone) as Date).toISOString(),
    to: (zonedWallTimeToUtc(next, '00:00', timeZone) as Date).toISOString(),
  };
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}
