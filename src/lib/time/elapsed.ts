// Elapsed time as a fixed clock: YYYY:MM:DD:HH:mm:ss (years, months, days, hours, minutes,
// seconds), zero padded, e.g. 0000:00:00:01:23:05 for one hour 23 minutes. Used by every timer
// in the app (KDS tickets, tables, open sales) so staff read one format everywhere.
// Years, months and days are calendar steps from the start, so a month is the real month length.
// Kept free of React and path aliases so node tests can import it directly.

export interface ElapsedParts {
  years: number;
  months: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** Whole milliseconds between the two instants (0 when the end is before the start). */
  totalMs: number;
}

function toMs(v: Date | string | number): number {
  return v instanceof Date ? v.getTime() : typeof v === 'number' ? v : new Date(v).getTime();
}

/** Splits the time from `from` to `to` into calendar years, months and days, then h:m:s. */
export function elapsedParts(from: Date | string | number, to: Date | string | number = Date.now()): ElapsedParts {
  const startMs = toMs(from);
  const endMs = toMs(to);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return { years: 0, months: 0, days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0 };
  }
  const start = new Date(startMs);
  // Whole calendar months first (UTC fields so a DST change never shifts a step by an hour).
  let months =
    (new Date(endMs).getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (new Date(endMs).getUTCMonth() - start.getUTCMonth());
  const addMonths = (m: number) => {
    const d = new Date(startMs);
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + m);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last));
    return d.getTime();
  };
  while (months > 0 && addMonths(months) > endMs) months--;
  const anchor = addMonths(months);
  let rest = Math.floor((endMs - anchor) / 1000);
  const days = Math.floor(rest / 86_400);
  rest -= days * 86_400;
  const hours = Math.floor(rest / 3600);
  rest -= hours * 3600;
  const minutes = Math.floor(rest / 60);
  const seconds = rest - minutes * 60;
  return {
    years: Math.floor(months / 12),
    months: months % 12,
    days,
    hours,
    minutes,
    seconds,
    totalMs: endMs - startMs,
  };
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** YYYY:MM:DD:HH:mm:ss between two instants (end defaults to now). */
export function formatElapsedClock(from: Date | string | number, to: Date | string | number = Date.now()): string {
  const p = elapsedParts(from, to);
  return `${pad(p.years, 4)}:${pad(p.months)}:${pad(p.days)}:${pad(p.hours)}:${pad(p.minutes)}:${pad(p.seconds)}`;
}

/** Whole minutes between two instants, for timer colour thresholds. */
export function elapsedMinutes(from: Date | string | number, to: Date | string | number = Date.now()): number {
  return Math.floor(elapsedParts(from, to).totalMs / 60_000);
}
