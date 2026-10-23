// Server-only: Timezone + event-calendar helpers for the audience engine.
// Timezone: America/New_York (merchant TZ), via Intl — same approach as
// clover-dates.server.ts. Overnight windows are attributed to the *starting*
// calendar day so a 1 AM Saturday tab belongs to Friday nightlife.

const TZ = "America/New_York";

/** Wall-clock parts in merchant TZ for a UTC epoch-ms timestamp. */
export function wallParts(ms: number): {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  dow: number;
} {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = fmt.formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const dowMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    y: Number(get("year")),
    mo: Number(get("month")),
    d: Number(get("day")),
    h: Number(get("hour")) % 24,
    mi: Number(get("minute")),
    dow: dowMap[get("weekday")] ?? 0,
  };
}

/** YYYY-MM-DD date string in merchant TZ for a UTC epoch-ms timestamp. */
export function wallDate(ms: number): string {
  const { y, mo, d } = wallParts(ms);
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Convert wall-clock (TZ) to UTC ms using the known offset. */
function wallToUtc(y: number, mo: number, d: number, h: number, mi: number): number {
  const guess = Date.UTC(y, mo, d, h, mi, 0);
  const back = wallParts(guess);
  const wallMs = Date.UTC(back.y, back.mo - 1, back.d, back.h, back.mi, 0);
  const offset = wallMs - guess;
  return guess - offset;
}

/** True if a UTC-ms timestamp falls within [dateStr 20:00, dateStr+1 06:00) in TZ. */
export function inEventWindow(ms: number, dateStr: string): boolean {
  const parts = dateStr.split("-").map(Number);
  const y = parts[0] ?? 2024;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const startUtc = wallToUtc(y, m - 1, d, 20, 0);
  const endUtc = startUtc + 10 * 3600 * 1000; // 8 PM → 6 AM
  return ms >= startUtc && ms <= endUtc;
}

/** True if wall-clock hour is within [startH, endH) on the same calendar day. */
export function inHourRange(ms: number, startH: number, endH: number): boolean {
  const { h } = wallParts(ms);
  return h >= startH && h < endH;
}

/** True if the timestamp's wall-clock day-of-week matches (0=Sun..6=Sat). */
export function isDow(ms: number, dow: number): boolean {
  return wallParts(ms).dow === dow;
}

/** True if wall-clock date is within [startStr, endStr] inclusive (YYYY-MM-DD). */
export function inDateRange(ms: number, startStr: string, endStr: string): boolean {
  const ds = wallDate(ms);
  return ds >= startStr && ds <= endStr;
}

/** True if wall-clock date is exactly dateStr. */
export function isDate(ms: number, dateStr: string): boolean {
  return wallDate(ms) === dateStr;
}

/** Overnight nightlife window: starts on startDow at startH, runs to next day
 *  endHNextDay. Attributed to the *starting* day. */
export function inOvernightWindow(
  ms: number,
  startDow: number,
  startH: number,
  endHNextDay: number,
): boolean {
  const { dow, h } = wallParts(ms);
  if (dow === startDow && h >= startH) return true;
  if (dow === (startDow + 1) % 7 && h < endHNextDay) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Verified event calendars (master plan §2, §3)
// ---------------------------------------------------------------------------

export const UFC_EVENT_DATES_2023 = [
  "2023-01-21",
  "2023-02-04",
  "2023-02-18",
  "2023-03-04",
  "2023-03-18",
  "2023-04-08",
  "2023-04-15",
  "2023-04-29",
  "2023-05-06",
  "2023-05-13",
  "2023-05-20",
  "2023-06-03",
  "2023-06-10",
  "2023-06-17",
  "2023-07-01",
  "2023-07-08",
  "2023-07-15",
  "2023-07-22",
  "2023-07-29",
  "2023-08-05",
  "2023-08-12",
  "2023-08-19",
  "2023-09-09",
  "2023-09-16",
  "2023-10-07",
  "2023-10-14",
  "2023-10-21",
  "2023-11-04",
  "2023-11-11",
  "2023-11-18",
  "2023-12-02",
  "2023-12-09",
  "2023-12-16",
];
export const UFC_EVENT_DATES_2024 = [
  "2024-01-13",
  "2024-01-20",
  "2024-02-03",
  "2024-02-10",
  "2024-02-17",
  "2024-03-02",
  "2024-03-09",
  "2024-03-23",
  "2024-04-06",
  "2024-04-13",
  "2024-04-27",
  "2024-05-04",
  "2024-05-11",
  "2024-05-18",
  "2024-06-01",
  "2024-06-08",
  "2024-06-15",
  "2024-06-22",
  "2024-06-29",
  "2024-07-06",
  "2024-07-13",
  "2024-07-20",
  "2024-07-27",
  "2024-08-03",
  "2024-08-10",
  "2024-08-17",
  "2024-09-07",
  "2024-09-14",
  "2024-09-28",
  "2024-10-05",
  "2024-10-12",
  "2024-10-19",
  "2024-11-02",
  "2024-11-09",
  "2024-11-16",
  "2024-11-23",
  "2024-12-07",
  "2024-12-14",
];
export const UFC_EVENT_DATES_2025 = [
  "2025-01-11",
  "2025-01-18",
  "2025-02-01",
  "2025-02-08",
  "2025-02-15",
  "2025-03-01",
  "2025-03-08",
  "2025-03-22",
  "2025-04-05",
  "2025-04-12",
  "2025-04-26",
  "2025-05-03",
  "2025-05-10",
  "2025-05-17",
  "2025-06-07",
  "2025-06-14",
  "2025-06-21",
  "2025-06-28",
  "2025-07-19",
  "2025-07-26",
  "2025-08-02",
  "2025-08-16",
  "2025-09-06",
  "2025-09-13",
  "2025-09-27",
  "2025-10-04",
  "2025-10-11",
  "2025-10-18",
  "2025-10-25",
  "2025-11-01",
  "2025-11-08",
  "2025-11-15",
  "2025-11-22",
  "2025-12-06",
  "2025-12-13",
];
export const UFC_EVENT_DATES = [
  ...UFC_EVENT_DATES_2023,
  ...UFC_EVENT_DATES_2024,
  ...UFC_EVENT_DATES_2025,
];

export const HALLOWEEN_DATES = ["2024-10-26", "2024-10-31", "2025-10-25", "2025-10-31"];
export const THANKSGIVING_EVE_DATES = ["2024-11-27", "2025-11-26"];
export const THANKSGIVING_DAY_DATES = ["2023-11-23", "2024-11-28", "2025-11-27"];

/** Seasonal football windows: Sep–Feb across 3 seasons. */
export const SUNDAY_FOOTBALL_WINDOWS: Array<[string, string]> = [
  ["2023-09-01", "2024-02-29"],
  ["2024-09-01", "2025-02-28"],
  ["2025-09-01", "2026-02-28"],
];

/** Returns the event date string if the timestamp falls in any event window.
 *  Uses the SAME date-matching logic as the individual audience predicates:
 *  UFC = 8 PM–6 AM event window; Halloween/Thanksgiving Eve/Day = full calendar
 *  day. This keeps `repeat_special_event` consistent with the per-audience
 *  definitions (master plan §3, §4). */
export function matchEventDate(ms: number): string | null {
  for (const d of UFC_EVENT_DATES) if (inEventWindow(ms, d)) return d;
  for (const d of HALLOWEEN_DATES) if (isDate(ms, d)) return d;
  for (const d of THANKSGIVING_EVE_DATES) if (isDate(ms, d)) return d;
  for (const d of THANKSGIVING_DAY_DATES) if (isDate(ms, d)) return d;
  return null;
}
