// Работа с часовыми поясами без внешних библиотек (через Intl).

export interface LocalDateTime {
  year: number;
  month: number; // 1..12
  day: number;
  hour: number;
  minute: number;
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Смещение пояса относительно UTC (мс) в указанный момент. */
export function tzOffset(tz: string, utc: number): number {
  const parts: Record<string, string> = {};
  for (const p of formatter(tz).formatToParts(new Date(utc))) parts[p.type] = p.value;
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(utc / 1000) * 1000;
}

/** UTC → локальное время в поясе tz. */
export function toLocal(utc: number, tz: string): LocalDateTime & { weekday: number } {
  const d = new Date(utc + tzOffset(tz, utc));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    weekday: d.getUTCDay() === 0 ? 7 : d.getUTCDay(), // 1 = пн … 7 = вс
  };
}

/**
 * Локальное время в поясе tz → UTC. Переполнения (32-е число, 25 часов)
 * нормализуются как в Date.UTC, поэтому можно просто прибавлять дни/месяцы.
 */
export function fromLocal(l: LocalDateTime, tz: string): number {
  const guess = Date.UTC(l.year, l.month - 1, l.day, l.hour, l.minute);
  const off1 = tzOffset(tz, guess - tzOffset(tz, guess));
  const utc = guess - off1;
  const off2 = tzOffset(tz, utc);
  return off2 === off1 ? utc : guess - off2;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const fullFormatters = new Map<string, Intl.DateTimeFormat>();

/** «пн, 14 окт. 2026, 10:00» в поясе пользователя. */
export function formatDateTime(utc: number, tz: string): string {
  let f = fullFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("ru-RU", {
      timeZone: tz,
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    fullFormatters.set(tz, f);
  }
  return f.format(new Date(utc));
}

/** Принимает «Europe/Moscow», «UTC», «+3», «UTC+3», «GMT-5». */
export function normalizeTimeZone(input: string): string | null {
  const s = input.trim();
  const m = s.match(/^(?:utc|gmt)?\s*([+-])\s*(\d{1,2})$/i);
  if (m) {
    const h = Number(m[2]);
    if (h > 14) return null;
    if (h === 0) return "UTC";
    // В базе IANA знак у Etc/GMT инвертирован: UTC+3 = Etc/GMT-3
    return `Etc/GMT${m[1] === "+" ? "-" : "+"}${h}`;
  }
  if (/^(utc|gmt)$/i.test(s)) return "UTC";
  if (!isValidTimeZone(s)) return null;
  return new Intl.DateTimeFormat("en-US", { timeZone: s }).resolvedOptions().timeZone;
}
