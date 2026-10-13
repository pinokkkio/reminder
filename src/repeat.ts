import { daysInMonth, fromLocal, toLocal } from "./time";

export type RepeatUnit = "minute" | "hour" | "day" | "week" | "month" | "year";

export interface Repeat {
  unit: RepeatUnit;
  every: number; // каждые N единиц
  weekdays?: number[]; // для unit=week: 1 = пн … 7 = вс
  day?: number; // для month/year: «якорное» число месяца (31 → последний день в коротких месяцах)
}

const UNIT_NAMES: Record<RepeatUnit, [string, string, string]> = {
  minute: ["минуту", "минуты", "минут"],
  hour: ["час", "часа", "часов"],
  day: ["день", "дня", "дней"],
  week: ["неделю", "недели", "недель"],
  month: ["месяц", "месяца", "месяцев"],
  year: ["год", "года", "лет"],
};

const WEEKDAY_SHORT = ["", "пн", "вт", "ср", "чт", "пт", "сб", "вс"];

export function plural(n: number, forms: [string, string, string]): string {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return forms[0];
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return forms[1];
  return forms[2];
}

export function describeRepeat(r: Repeat | null | undefined): string {
  if (!r) return "однократно";
  if (r.unit === "week" && r.weekdays?.length) {
    const days = [...r.weekdays].sort((a, b) => a - b);
    if (days.join() === "1,2,3,4,5") return "по будням";
    if (days.join() === "6,7") return "по выходным";
    if (days.length === 7) return "каждый день";
    return "по дням: " + days.map((d) => WEEKDAY_SHORT[d]).join(", ");
  }
  if (r.every === 1) {
    const single: Record<RepeatUnit, string> = {
      minute: "каждую минуту",
      hour: "каждый час",
      day: "каждый день",
      week: "каждую неделю",
      month: "каждый месяц",
      year: "каждый год",
    };
    return single[r.unit];
  }
  const word = r.every % 10 === 1 && r.every % 100 !== 11 ? (r.unit === "minute" || r.unit === "week" ? "каждую" : "каждый") : "каждые";
  return `${word} ${r.every} ${plural(r.every, UNIT_NAMES[r.unit])}`;
}

/** Приводит правило к каноническому виду и фиксирует якоря по первому срабатыванию. */
export function normalizeRepeat(r: Repeat, firstAt: number, tz: string): Repeat {
  const every = Math.max(1, Math.min(1000, Math.floor(r.every || 1)));
  const out: Repeat = { unit: r.unit, every };
  if (r.unit === "week" && r.weekdays?.length) {
    out.weekdays = [...new Set(r.weekdays)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
    out.every = 1;
  }
  if (r.unit === "month" || r.unit === "year") out.day = r.day ?? toLocal(firstAt, tz).day;
  return out;
}

/** Ближайшее срабатывание строго после `after`, начиная от предыдущего `prev`. */
export function nextOccurrence(prev: number, r: Repeat, tz: string, after: number = prev): number {
  let t = prev;
  for (let i = 0; i < 100_000; i++) {
    t = step(t, r, tz);
    if (t > after) return t;
  }
  throw new Error("nextOccurrence: too many iterations");
}

function step(t: number, r: Repeat, tz: string): number {
  if (r.unit === "minute") return t + r.every * 60_000;
  if (r.unit === "hour") return t + r.every * 3_600_000;

  const l = toLocal(t, tz);
  switch (r.unit) {
    case "day":
      return fromLocal({ ...l, day: l.day + r.every }, tz);
    case "week": {
      if (!r.weekdays?.length) return fromLocal({ ...l, day: l.day + 7 * r.every }, tz);
      for (let d = 1; d <= 7; d++) {
        const wd = ((l.weekday - 1 + d) % 7) + 1;
        if (r.weekdays.includes(wd)) return fromLocal({ ...l, day: l.day + d }, tz);
      }
      throw new Error("unreachable");
    }
    case "month":
    case "year": {
      const months = r.unit === "month" ? r.every : 12 * r.every;
      const total = l.year * 12 + (l.month - 1) + months;
      const year = Math.floor(total / 12);
      const month = (total % 12) + 1;
      const day = Math.min(r.day ?? l.day, daysInMonth(year, month));
      return fromLocal({ year, month, day, hour: l.hour, minute: l.minute }, tz);
    }
  }
}

/** Для правил «по дням недели» сдвигает момент на ближайший подходящий день (включая текущий). */
export function alignToWeekdays(at: number, r: Repeat, tz: string): number {
  if (r.unit !== "week" || !r.weekdays?.length) return at;
  for (let i = 0; i < 7; i++) {
    const l = toLocal(at, tz);
    if (r.weekdays.includes(l.weekday)) break;
    at = fromLocal({ ...l, day: l.day + 1 }, tz);
  }
  return at;
}

export function parseRepeat(json: string | null): Repeat | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as Repeat;
  } catch {
    return null;
  }
}
