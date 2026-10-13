import { describe, expect, it } from "vitest";
import { parseReminder } from "../tgcloud/lib/parser.js";
import { fromLocal, toLocal } from "../tgcloud/lib/time.js";

const TZ = "Europe/Moscow";
// Вторник, 13 октября 2026, 11:20 по Москве
const NOW = fromLocal({ year: 2026, month: 10, day: 13, hour: 11, minute: 20 }, TZ);

function ok(input) {
  const r = parseReminder(input, NOW, TZ);
  if (!r.ok) throw new Error(`${input}: ${r.error}`);
  const l = toLocal(r.at, TZ);
  const pad = (n) => String(n).padStart(2, "0");
  return { ...r, when: `${l.year}-${pad(l.month)}-${pad(l.day)} ${pad(l.hour)}:${pad(l.minute)}` };
}

describe("parseReminder", () => {
  it.each([
    ["напомни завтра в 10:30 позвонить маме", "2026-10-14 10:30", "позвонить маме"],
    ["Напомни мне завтра в 10 утра позвонить маме", "2026-10-14 10:00", "позвонить маме"],
    ["в 7 вечера вынести мусор", "2026-10-13 19:00", "вынести мусор"],
    ["в 9:00 зарядка", "2026-10-14 09:00", "зарядка"],
    ["послезавтра купить хлеб", "2026-10-15 09:00", "купить хлеб"],
    ["25 декабря в 18:00 купить подарки", "2026-12-25 18:00", "купить подарки"],
    ["1 марта поздравить", "2027-03-01 09:00", "поздравить"],
    ["05.11 в 12:15 врач", "2026-11-05 12:15", "врач"],
    ["2027-01-02 в 8:00 поезд", "2027-01-02 08:00", "поезд"],
    ["через 2 часа выключить духовку", "2026-10-13 13:20", "выключить духовку"],
    ["через полчаса чай", "2026-10-13 11:50", "чай"],
    ["через час встреча", "2026-10-13 12:20", "встреча"],
    ["через пять минут проверить", "2026-10-13 11:25", "проверить"],
    ["через 3 дня в 15:00 сдать отчёт", "2026-10-16 15:00", "сдать отчёт"],
    ["в пятницу в 19 кино", "2026-10-16 19:00", "кино"],
    ["в понедельник созвон", "2026-10-19 09:00", "созвон"],
    ["вечером позвонить Ане", "2026-10-13 19:00", "позвонить Ане"],
    ["напомни что завтра в 12 обед с Олей", "2026-10-14 12:00", "обед с Олей"],
  ])("%s", (input, when, text) => {
    const r = ok(input);
    expect(r.when).toBe(when);
    expect(r.text).toBe(text);
    expect(r.repeat).toBeNull();
  });

  it("каждый день", () => {
    const r = ok("каждый день в 9:00 зарядка");
    expect(r.when).toBe("2026-10-14 09:00");
    expect(r.repeat).toEqual({ unit: "day", every: 1 });
    expect(r.text).toBe("зарядка");
  });

  it("ежедневно в 21:00", () => {
    const r = ok("ежедневно в 21:00 таблетка");
    expect(r.when).toBe("2026-10-13 21:00");
    expect(r.repeat).toEqual({ unit: "day", every: 1 });
  });

  it("по будням", () => {
    const r = ok("по будням в 8:30 выпить таблетку");
    expect(r.when).toBe("2026-10-14 08:30");
    expect(r.repeat).toEqual({ unit: "week", every: 1, weekdays: [1, 2, 3, 4, 5] });
    expect(r.text).toBe("выпить таблетку");
  });

  it("по выходным", () => {
    const r = ok("по выходным в 11 уборка");
    expect(r.when).toBe("2026-10-17 11:00");
    expect(r.repeat?.weekdays).toEqual([6, 7]);
  });

  it("несколько дней недели", () => {
    const r = ok("каждый понедельник и четверг в 20:00 спортзал");
    expect(r.when).toBe("2026-10-15 20:00");
    expect(r.repeat).toEqual({ unit: "week", every: 1, weekdays: [1, 4] });
    expect(r.text).toBe("спортзал");
  });

  it("по средам", () => {
    const r = ok("по средам в 18:00 бассейн");
    expect(r.when).toBe("2026-10-14 18:00");
    expect(r.repeat?.weekdays).toEqual([3]);
  });

  it("каждые 3 часа", () => {
    const r = ok("каждые 3 часа пить воду");
    expect(r.when).toBe("2026-10-13 14:20");
    expect(r.repeat).toEqual({ unit: "hour", every: 3 });
    expect(r.text).toBe("пить воду");
  });

  it("каждый месяц 15 числа", () => {
    const r = ok("каждый месяц 15 числа в 12:00 оплатить интернет");
    expect(r.when).toBe("2026-10-15 12:00");
    expect(r.repeat).toEqual({ unit: "month", every: 1, day: 15 });
    expect(r.text).toBe("оплатить интернет");
  });

  it("каждое 1 число (уже прошло в этом месяце)", () => {
    const r = ok("каждое 1 число квартплата");
    expect(r.when).toBe("2026-11-01 09:00");
    expect(r.repeat).toEqual({ unit: "month", every: 1, day: 1 });
  });

  it("каждый год", () => {
    const r = ok("каждый год 1 марта поздравить сестру");
    expect(r.when).toBe("2027-03-01 09:00");
    expect(r.repeat).toEqual({ unit: "year", every: 1, day: 1 });
  });

  it("каждые 2 недели", () => {
    const r = ok("каждые 2 недели в 10:00 полить кактус");
    expect(r.repeat).toEqual({ unit: "week", every: 2 });
    expect(r.text).toBe("полить кактус");
  });

  it("ошибки", () => {
    expect(parseReminder("позвонить маме", NOW, TZ).ok).toBe(false);
    expect(parseReminder("завтра в 10", NOW, TZ).ok).toBe(false);
    expect(parseReminder("31.02 что-то", NOW, TZ).ok).toBe(false);
    expect(parseReminder("сегодня в 10:00 прошлое", NOW, TZ).ok).toBe(false);
  });

  it("учитывает часовой пояс", () => {
    const r = parseReminder("завтра в 10:00 тест", NOW, "Asia/Yekaterinburg");
    expect(r.ok && new Date(r.at).toISOString()).toBe("2026-10-14T05:00:00.000Z");
  });
});
