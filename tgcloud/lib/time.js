// Часовые пояса без внешних библиотек. Основной путь — Intl; если в среде
// выполнения нет данных о поясах, работает запасной вариант с фиксированным смещением.

/** @typedef {{ year: number, month: number, day: number, hour: number, minute: number }} LocalDateTime */

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const formatters = new Map();

function formatter(tz) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(tz, f);
  }
  return f;
}

/** Смещение для поясов с фиксированным сдвигом — запасной путь без Intl. */
function fixedOffset(tz) {
  if (tz === 'UTC' || tz === 'Etc/UTC') return 0;
  const m = /^Etc\/GMT([+-])(\d{1,2})$/.exec(tz);
  if (m) return (m[1] === '+' ? -1 : 1) * Number(m[2]) * HOUR; // знак в Etc/GMT инвертирован
  if (tz === 'Europe/Moscow') return 3 * HOUR;
  return null;
}

export function isValidTimeZone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return fixedOffset(tz) !== null;
  }
}

/** Смещение пояса относительно UTC (мс) в момент utc. */
export function tzOffset(tz, utc) {
  let parts;
  try {
    parts = {};
    for (const p of formatter(tz).formatToParts(new Date(utc))) parts[p.type] = p.value;
  } catch {
    return fixedOffset(tz) ?? 0;
  }
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  return asUtc - Math.floor(utc / 1000) * 1000;
}

/** UTC → локальное время в поясе tz; weekday: 1 = пн … 7 = вс. */
export function toLocal(utc, tz) {
  const d = new Date(utc + tzOffset(tz, utc));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    weekday: d.getUTCDay() === 0 ? 7 : d.getUTCDay(),
  };
}

/**
 * Локальное время в поясе tz → UTC. Переполнения (32-е число, 25 часов)
 * нормализуются как в Date.UTC, поэтому можно просто прибавлять дни.
 * @param {LocalDateTime} l
 */
export function fromLocal(l, tz) {
  const guess = Date.UTC(l.year, l.month - 1, l.day, l.hour, l.minute);
  const off1 = tzOffset(tz, guess - tzOffset(tz, guess));
  const utc = guess - off1;
  const off2 = tzOffset(tz, utc);
  return off2 === off1 ? utc : guess - off2;
}

export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WEEKDAYS_SHORT = ['', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

/** «ср, 14 октября 2026, 10:00» — без зависимости от локалей Intl. */
export function formatDateTime(utc, tz) {
  const l = toLocal(utc, tz);
  const pad = (n) => String(n).padStart(2, '0');
  return `${WEEKDAYS_SHORT[l.weekday]}, ${l.day} ${MONTHS_GEN[l.month - 1]} ${l.year}, ${pad(l.hour)}:${pad(l.minute)}`;
}

/** Принимает «Europe/Moscow», «UTC», «+3», «UTC+3», «GMT-5». */
export function normalizeTimeZone(input) {
  const s = String(input).trim();
  const m = /^(?:utc|gmt)?\s*([+-])\s*(\d{1,2})$/i.exec(s);
  if (m) {
    const h = Number(m[2]);
    if (h > 14) return null;
    if (h === 0) return 'UTC';
    return `Etc/GMT${m[1] === '+' ? '-' : '+'}${h}`;
  }
  if (/^(utc|gmt)$/i.test(s)) return 'UTC';
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: s }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}
