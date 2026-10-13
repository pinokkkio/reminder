// Разбор напоминаний на естественном русском языке:
//   «напомни завтра в 10:30 позвонить маме»
//   «через 2 часа выключить духовку»
//   «каждый понедельник в 9 планёрка»
//   «25 декабря в 18:00 купить подарки»
//   «каждые 3 часа пить воду», «каждый месяц 15 числа оплатить интернет»

import { alignToWeekdays, nextOccurrence, normalizeRepeat } from './repeat.js';
import { daysInMonth, fromLocal, toLocal } from './time.js';

/**
 * @typedef {import('./repeat.js').Repeat} Repeat
 * @typedef {{ ok: true, text: string, at: number, repeat: Repeat | null } | { ok: false, error: string }} ParseResult
 */

const DEFAULT_HOUR = 9;

const B = '(?<![\\p{L}\\d])'; // начало слова (\b не работает с кириллицей)
const E = '(?![\\p{L}\\d])'; // конец слова

const NUMBER_WORDS = {
  один: 1, одну: 1, одна: 1, одно: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6,
  семь: 7, восемь: 8, девять: 9, десять: 10, пятнадцать: 15, двадцать: 20, тридцать: 30, сорок: 40,
};
const NUM = `(\\d{1,4}|${Object.keys(NUMBER_WORDS).join('|')})`;
const UNIT =
  '(минут[уы]?|мин|час(?:а|ов)?|ч|дн(?:я|ей)|день|сут(?:ки|ок)|недел[юиь]|нед|месяц(?:а|ев)?|мес|год(?:а)?|лет)';

const MONTHS = [
  [/^янв/, 1], [/^фев/, 2], [/^мар/, 3], [/^апр/, 4], [/^ма[йя]/, 5], [/^июн/, 6],
  [/^июл/, 7], [/^авг/, 8], [/^сен/, 9], [/^окт/, 10], [/^ноя/, 11], [/^дек/, 12],
];
const MONTH =
  '(январ[ья]|феврал[ья]|марта?|апрел[ья]|ма[йя]|июн[ья]|июл[ья]|августа?|сентябр[ья]|октябр[ья]|ноябр[ья]|декабр[ья]|янв|фев|мар|апр|июн|июл|авг|сен|сент|окт|ноя|дек)\\.?';

const WEEKDAYS = [
  [/^(понедельник|пн)/, 1], [/^(вторник|вт)/, 2], [/^(сред|ср)/, 3], [/^(четверг|чт)/, 4],
  [/^(пятниц|пт)/, 5], [/^(суббот|сб)/, 6], [/^(воскресен|вс)/, 7],
];
const WD =
  '(понедельник(?:а|ам|у)?|вторник(?:а|ам|у)?|сред(?:а|у|ы|ам)|четверг(?:а|ам|у)?|пятниц(?:а|у|ы|ам)|суббот(?:а|у|ы|ам)|воскресень(?:е|я|ям)|пн|вт|ср|чт|пт|сб|вс)';

function num(s) {
  return /^\d+$/.test(s) ? Number(s) : NUMBER_WORDS[s];
}

function unitOf(s) {
  if (s.startsWith('мин')) return 'minute';
  if (s.startsWith('ч')) return 'hour';
  if (s.startsWith('д') || s.startsWith('сут')) return 'day';
  if (s.startsWith('нед')) return 'week';
  if (s.startsWith('мес')) return 'month';
  return 'year';
}

function monthOf(s) {
  return MONTHS.find(([re]) => re.test(s))[1];
}

function weekdayOf(s) {
  return WEEKDAYS.find(([re]) => re.test(s))[1];
}

/** Строка, из которой «вырезаются» распознанные фрагменты, остаток — текст напоминания. */
class Cursor {
  constructor(input) {
    this.orig = input;
    // toLowerCase и замена ё→е сохраняют длину строки, индексы совпадают
    this.low = input.toLowerCase().replace(/ё/g, 'е');
  }

  take(pattern, valid = () => true) {
    const re = new RegExp(pattern, 'gu');
    let m;
    while ((m = re.exec(this.low))) {
      if (valid(m)) {
        const blank = ' '.repeat(m[0].length);
        this.low = this.low.slice(0, m.index) + blank + this.low.slice(m.index + m[0].length);
        this.orig = this.orig.slice(0, m.index) + blank + this.orig.slice(m.index + m[0].length);
        return m;
      }
      if (m[0].length === 0) re.lastIndex++;
    }
    return null;
  }

  rest() {
    return this.orig;
  }
}

/** @returns {ParseResult} */
export function parseReminder(input, now, tz) {
  const c = new Cursor(input.trim());
  const nowL = toLocal(now, tz);

  c.take(`^\\s*напомн(?:и|ить|ите)${E}(?:\\s+(?:мне|нам)${E})?`);

  // ---------- Повторы ----------
  /** @type {Repeat | null} */
  let repeat = null;
  let monthDay;

  let m;
  if ((m = c.take(`${B}(?:кажд(?:ый|ую|ое|ые)|по)\\s+(будн(?:и|ям)|будним\\s+дням|рабочим\\s+дням|выходн(?:ые|ым)(?:\\s+дням)?)${E}`))) {
    repeat = { unit: 'week', every: 1, weekdays: m[1].startsWith('выход') ? [6, 7] : [1, 2, 3, 4, 5] };
  } else if ((m = c.take(`${B}(?:в\\s+)?(будни|выходные)${E}`))) {
    repeat = { unit: 'week', every: 1, weekdays: m[1] === 'выходные' ? [6, 7] : [1, 2, 3, 4, 5] };
  } else if ((m = c.take(`${B}(?:кажд(?:ый|ую|ое|ые)|по)\\s+${WD}${E}((?:\\s*(?:,|и)\\s*(?:в\\s+|во\\s+)?${WD}${E})*)`))) {
    const days = [weekdayOf(m[1])];
    for (const w of m[2].matchAll(new RegExp(WD, 'gu'))) days.push(weekdayOf(w[1]));
    repeat = { unit: 'week', every: 1, weekdays: days };
  } else if ((m = c.take(`${B}кажд(?:ое|ый)\\s+(\\d{1,2})(?:-?(?:е|го|ое))?\\s+числ[оа]${E}`))) {
    monthDay = Number(m[1]);
    repeat = { unit: 'month', every: 1 };
  } else if ((m = c.take(`${B}кажд(?:ые|ую|ый|ое)\\s+полчаса${E}`))) {
    repeat = { unit: 'minute', every: 30 };
  } else if ((m = c.take(`${B}кажд(?:ые|ую|ый|ое|ого)\\s+(?:${NUM}\\s+)?${UNIT}${E}`))) {
    repeat = { unit: unitOf(m[2]), every: m[1] ? num(m[1]) : 1 };
  } else if ((m = c.take(`${B}еже(дневно|часно|недельно|месячно|годно)${E}`))) {
    const map = { дневно: 'day', часно: 'hour', недельно: 'week', месячно: 'month', годно: 'year' };
    repeat = { unit: map[m[1]], every: 1 };
  }

  if (repeat?.unit === 'month' && monthDay === undefined) {
    if ((m = c.take(`${B}(\\d{1,2})(?:-?(?:е|го|ое))?\\s+числ[оа]${E}`))) monthDay = Number(m[1]);
  }
  if (monthDay !== undefined && (monthDay < 1 || monthDay > 31)) return fail('В месяце нет такого числа.');

  // ---------- Относительное время: «через 2 часа» ----------
  let relative = null;
  if ((m = c.take(`${B}через\\s+полчаса${E}`))) relative = { unit: 'minute', n: 30 };
  else if ((m = c.take(`${B}через\\s+полтора\\s+часа${E}`))) relative = { unit: 'minute', n: 90 };
  else if ((m = c.take(`${B}через\\s+(?:${NUM}\\s+)?${UNIT}${E}`))) relative = { unit: unitOf(m[2]), n: m[1] ? num(m[1]) : 1 };

  // ---------- Время суток ----------
  let time = null;
  const validTime = (h, mi) => h >= 0 && h <= 23 && mi >= 0 && mi <= 59;
  const applyPeriod = (h, period) => {
    if (!period) return h;
    if ((period === 'вечера' || period === 'дня') && h < 12) return h + 12;
    if (period === 'ночи' && h === 12) return 0;
    if (period === 'утра' && h === 12) return 0;
    return h;
  };
  const notDateAfter = `(?!\\s*(?:числа|число|${MONTH}|${UNIT}${E}|[./]\\d))`;

  if ((m = c.take(`${B}(?:в|во|к)\\s+(\\d{1,2})(?:[:.](\\d{2}))?(?:\\s*(?:ч|час(?:а|ов)?)${E})?(?:\\s+(утра|дня|вечера|ночи))?${E}${notDateAfter}`,
    (x) => validTime(applyPeriod(Number(x[1]), x[3]), Number(x[2] ?? 0))))) {
    time = { hour: applyPeriod(Number(m[1]), m[3]), minute: Number(m[2] ?? 0) };
  } else if ((m = c.take(`${B}(\\d{1,2}):(\\d{2})(?:\\s+(утра|дня|вечера|ночи))?${E}`,
    (x) => validTime(applyPeriod(Number(x[1]), x[3]), Number(x[2]))))) {
    time = { hour: applyPeriod(Number(m[1]), m[3]), minute: Number(m[2]) };
  } else if ((m = c.take(`${B}(\\d{1,2})\\s+(утра|дня|вечера|ночи)${E}`, (x) => validTime(applyPeriod(Number(x[1]), x[2]), 0)))) {
    time = { hour: applyPeriod(Number(m[1]), m[2]), minute: 0 };
  } else if ((m = c.take(`${B}(?:в\\s+)?(полдень|полночь)${E}`))) {
    time = { hour: m[1] === 'полдень' ? 12 : 0, minute: 0 };
  } else if ((m = c.take(`${B}(утром|днем|вечером)${E}`))) {
    time = { hour: m[1] === 'утром' ? 9 : m[1] === 'днем' ? 13 : 19, minute: 0 };
  }

  // ---------- Дата ----------
  let date = null; // { year?, month, day }
  let weekday = null;

  if ((m = c.take(`${B}(\\d{4})-(\\d{1,2})-(\\d{1,2})${E}`))) {
    date = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  } else if ((m = c.take(`${B}(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{2}|\\d{4}))?${E}`, (x) => Number(x[2]) >= 1 && Number(x[2]) <= 12))) {
    const y = m[3] ? Number(m[3]) : undefined;
    date = { year: y !== undefined && y < 100 ? 2000 + y : y, month: Number(m[2]), day: Number(m[1]) };
  } else if ((m = c.take(`${B}(\\d{1,2})(?:-?(?:е|го|ое))?\\s+${MONTH}(?:\\s+(\\d{4})(?:\\s*(?:г\\.?|года?)${E})?)?(?![\\p{L}\\d])`))) {
    date = { year: m[3] ? Number(m[3]) : undefined, month: monthOf(m[2]), day: Number(m[1]) };
  } else if ((m = c.take(`${B}(сегодня|завтра|послезавтра)${E}`))) {
    const add = m[1] === 'сегодня' ? 0 : m[1] === 'завтра' ? 1 : 2;
    const d = toLocal(fromLocal({ ...nowL, day: nowL.day + add, hour: 12, minute: 0 }, tz), tz);
    date = { year: d.year, month: d.month, day: d.day };
  } else if ((m = c.take(`${B}(?:(?:в|во)\\s+)?(?:(?:следующ|ближайш)(?:ий|ую|ее|ей)\\s+)?${WD}${E}`))) {
    weekday = weekdayOf(m[1]);
  } else if (monthDay === undefined && (m = c.take(`${B}(\\d{1,2})(?:-?(?:е|го|ое))?\\s+числ[ао]${E}`))) {
    monthDay = Number(m[1]);
  }

  if (date && (date.month < 1 || date.month > 12 || date.day < 1 || date.day > daysInMonth(date.year ?? 2000, date.month))) {
    return fail('Такой даты не существует.');
  }

  // ---------- Текст ----------
  const text = c
    .rest()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:[,.:;!—–-]\s*)+/u, '')
    .replace(/^(?:о том,?\s+что|что(?:бы)?|о|об|про)(?![\p{L}\d])[\s,:—–-]*/iu, '')
    .replace(/^[,.:;—–-]\s*/u, '')
    .replace(/[\s,;:—–-]+$/u, '')
    .trim();

  if (!text) return fail('Не понял, о чём напомнить. Напишите текст напоминания.');
  if (!repeat && !relative && !time && !date && weekday === null && monthDay === undefined) {
    return fail('Не нашёл, когда напомнить. Например: «завтра в 10:00 позвонить маме» или «через 30 минут проверить духовку».');
  }

  // ---------- Сборка момента срабатывания ----------
  const hm = time ?? { hour: DEFAULT_HOUR, minute: 0 };
  let at;

  if (relative && (relative.unit === 'minute' || relative.unit === 'hour')) {
    at = now + relative.n * (relative.unit === 'minute' ? 60_000 : 3_600_000);
    at = Math.round(at / 60_000) * 60_000;
  } else if (relative) {
    const base = time ? { ...nowL, ...time } : nowL;
    const months = relative.unit === 'month' ? relative.n : relative.unit === 'year' ? 12 * relative.n : 0;
    const days = relative.unit === 'day' ? relative.n : relative.unit === 'week' ? 7 * relative.n : 0;
    if (months) {
      const total = base.year * 12 + base.month - 1 + months;
      const y = Math.floor(total / 12);
      const mo = (total % 12) + 1;
      at = fromLocal({ ...base, year: y, month: mo, day: Math.min(base.day, daysInMonth(y, mo)) }, tz);
    } else {
      at = fromLocal({ ...base, day: base.day + days }, tz);
    }
  } else if (date) {
    const year = date.year ?? nowL.year;
    at = fromLocal({ year, month: date.month, day: date.day, ...hm }, tz);
    if (at <= now && date.year === undefined && !(year === nowL.year && date.month === nowL.month && date.day === nowL.day)) {
      at = fromLocal({ year: year + 1, month: date.month, day: Math.min(date.day, daysInMonth(year + 1, date.month)), ...hm }, tz);
    }
  } else if (weekday !== null) {
    let diff = (weekday - nowL.weekday + 7) % 7;
    at = fromLocal({ ...nowL, day: nowL.day + diff, ...hm }, tz);
    if (at <= now) {
      diff += 7;
      at = fromLocal({ ...nowL, day: nowL.day + diff, ...hm }, tz);
    }
  } else if (monthDay !== undefined) {
    const clamp = (y, mo) => Math.min(monthDay, daysInMonth(y, mo));
    at = fromLocal({ year: nowL.year, month: nowL.month, day: clamp(nowL.year, nowL.month), ...hm }, tz);
    if (at <= now) {
      const y = nowL.month === 12 ? nowL.year + 1 : nowL.year;
      const mo = nowL.month === 12 ? 1 : nowL.month + 1;
      at = fromLocal({ year: y, month: mo, day: clamp(y, mo), ...hm }, tz);
    }
  } else if (repeat && !time && (repeat.unit === 'minute' || repeat.unit === 'hour')) {
    at = Math.round(now / 60_000) * 60_000 + repeat.every * (repeat.unit === 'minute' ? 60_000 : 3_600_000);
  } else {
    at = fromLocal({ ...nowL, ...hm }, tz);
    if (at <= now) at = fromLocal({ ...nowL, day: nowL.day + 1, ...hm }, tz);
  }

  if (repeat) {
    if (monthDay !== undefined) repeat.day = monthDay;
    // Для «по понедельникам» сдвигаем первое срабатывание на подходящий день недели
    at = alignToWeekdays(at, repeat, tz);
    repeat = normalizeRepeat(repeat, at, tz);
    if (at <= now) at = nextOccurrence(at, repeat, tz, now);
  } else if (at <= now) {
    return fail('Это время уже прошло.');
  }

  return { ok: true, text, at, repeat };
}

/** @returns {ParseResult} */
function fail(error) {
  return { ok: false, error };
}
