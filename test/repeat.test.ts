import { describe, expect, it } from "vitest";
import { describeRepeat, nextOccurrence } from "../src/repeat";
import { fromLocal, normalizeTimeZone, toLocal } from "../src/time";

const at = (tz: string, y: number, mo: number, d: number, h = 9, mi = 0) => fromLocal({ year: y, month: mo, day: d, hour: h, minute: mi }, tz);
const fmt = (t: number, tz: string) => {
  const l = toLocal(t, tz);
  return `${l.year}-${l.month}-${l.day} ${l.hour}:${String(l.minute).padStart(2, "0")}`;
};

describe("nextOccurrence", () => {
  it("ежедневно сохраняет локальное время при переходе на летнее время", () => {
    const tz = "Europe/Berlin";
    const t = at(tz, 2026, 3, 28, 9);
    expect(fmt(nextOccurrence(t, { unit: "day", every: 1 }, tz), tz)).toBe("2026-3-29 9:00");
  });

  it("ежемесячно 31-го → последний день короткого месяца, затем снова 31-е", () => {
    const tz = "Europe/Moscow";
    const r = { unit: "month" as const, every: 1, day: 31 };
    const feb = nextOccurrence(at(tz, 2027, 1, 31), r, tz);
    expect(fmt(feb, tz)).toBe("2027-2-28 9:00");
    expect(fmt(nextOccurrence(feb, r, tz), tz)).toBe("2027-3-31 9:00");
  });

  it("по дням недели", () => {
    const tz = "Europe/Moscow";
    const r = { unit: "week" as const, every: 1, weekdays: [1, 4] };
    const mon = at(tz, 2026, 10, 19, 20);
    const thu = nextOccurrence(mon, r, tz);
    expect(fmt(thu, tz)).toBe("2026-10-22 20:00");
    expect(fmt(nextOccurrence(thu, r, tz), tz)).toBe("2026-10-26 20:00");
  });

  it("пропускает пропущенные срабатывания до текущего момента", () => {
    const tz = "UTC";
    const t = at(tz, 2026, 1, 1, 0);
    const now = at(tz, 2026, 1, 1, 10, 30);
    expect(fmt(nextOccurrence(t, { unit: "hour", every: 3 }, tz, now), tz)).toBe("2026-1-1 12:00");
  });
});

describe("describeRepeat", () => {
  it.each([
    [{ unit: "day", every: 1 }, "каждый день"],
    [{ unit: "hour", every: 3 }, "каждые 3 часа"],
    [{ unit: "minute", every: 5 }, "каждые 5 минут"],
    [{ unit: "day", every: 21 }, "каждый 21 день"],
    [{ unit: "week", every: 1, weekdays: [1, 2, 3, 4, 5] }, "по будням"],
    [{ unit: "week", every: 1, weekdays: [1, 4] }, "по дням: пн, чт"],
  ] as const)("%j", (r, s) => expect(describeRepeat(r as never)).toBe(s));
});

describe("normalizeTimeZone", () => {
  it.each([
    ["+3", "Etc/GMT-3"],
    ["UTC-5", "Etc/GMT+5"],
    ["utc", "UTC"],
    ["europe/moscow", "Europe/Moscow"],
    ["Mars/Base", null],
  ])("%s", (input, out) => expect(normalizeTimeZone(input)).toBe(out));
});
