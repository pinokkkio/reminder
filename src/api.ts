// REST API для мини-приложения. Авторизация: заголовок `Authorization: tma <initData>`.

import { validateInitData } from "./auth";
import type { Bot } from "./bot";
import type { Reminder } from "./db";
import type { Env } from "./env";
import { parseReminder } from "./parser";
import { type Repeat, type RepeatUnit, alignToWeekdays, describeRepeat, nextOccurrence, normalizeRepeat } from "./repeat";
import { formatDateTime, normalizeTimeZone } from "./time";

const UNITS: RepeatUnit[] = ["minute", "hour", "day", "week", "month", "year"];

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function view(r: Reminder) {
  return {
    id: r.id,
    text: r.text,
    next_at: r.next_at,
    next_text: formatDateTime(r.next_at, r.tz),
    repeat: r.repeat,
    repeat_text: r.repeat ? describeRepeat(r.repeat) : null,
  };
}

function validRepeat(x: unknown): Repeat | null | undefined {
  if (x === null || x === undefined) return null;
  if (typeof x !== "object") return undefined;
  const r = x as Partial<Repeat>;
  if (!UNITS.includes(r.unit as RepeatUnit)) return undefined;
  const every = Number(r.every ?? 1);
  if (!Number.isInteger(every) || every < 1 || every > 1000) return undefined;
  const weekdays = Array.isArray(r.weekdays) ? r.weekdays.map(Number).filter((d) => d >= 1 && d <= 7) : undefined;
  return { unit: r.unit as RepeatUnit, every, ...(weekdays?.length ? { weekdays } : {}) };
}

export async function handleApi(req: Request, url: URL, env: Env, bot: Bot): Promise<Response> {
  const auth = req.headers.get("authorization") ?? "";
  const user = auth.startsWith("tma ") ? await validateInitData(auth.slice(4), env.BOT_TOKEN) : null;
  if (!user) return json({ error: "unauthorized" }, 401);
  const chatId = user.id;
  const path = url.pathname.replace(/\/+$/, "");

  if (path === "/api/reminders" && req.method === "GET") {
    const [tz, items] = await Promise.all([bot.db.getTz(chatId), bot.db.list(chatId)]);
    return json({ tz, reminders: items.map(view) });
  }

  if (path === "/api/tz" && req.method === "PUT") {
    const body = (await req.json().catch(() => ({}))) as { tz?: string };
    const tz = body.tz ? normalizeTimeZone(body.tz) : null;
    if (!tz) return json({ error: "Неизвестный часовой пояс" }, 400);
    await bot.db.setTz(chatId, tz);
    return json({ tz });
  }

  if (path === "/api/reminders" && req.method === "POST") {
    const body = (await req.json().catch(() => ({}))) as { text?: string; at?: number; repeat?: unknown };
    const text = String(body.text ?? "").trim().slice(0, 1000);
    if (!text) return json({ error: "Введите текст напоминания" }, 400);
    if (!(await bot.db.canAdd(chatId))) return json({ error: "Слишком много активных напоминаний" }, 400);

    const tz = await bot.db.getTz(chatId);
    const now = Date.now();
    let at: number;
    let repeat: Repeat | null;
    let finalText = text;

    if (body.at === undefined || body.at === null) {
      // Свободный текст — тот же разбор, что и в чате
      const parsed = parseReminder(text, now, tz);
      if (!parsed.ok) return json({ error: parsed.error }, 400);
      ({ at, repeat } = parsed);
      finalText = parsed.text;
    } else {
      at = Math.round(Number(body.at) / 60_000) * 60_000;
      const rep = validRepeat(body.repeat);
      if (!Number.isFinite(at) || rep === undefined) return json({ error: "Некорректные данные" }, 400);
      if (rep) at = alignToWeekdays(at, rep, tz);
      repeat = rep ? normalizeRepeat(rep, at, tz) : null;
      if (at <= now) {
        if (!repeat) return json({ error: "Это время уже прошло" }, 400);
        at = nextOccurrence(at, repeat, tz, now);
      }
    }

    await bot.db.ensureUser(chatId);
    const id = await bot.db.add(chatId, finalText, at, repeat, tz);
    return json({ reminder: view((await bot.db.get(id))!) }, 201);
  }

  const del = path.match(/^\/api\/reminders\/(\d+)$/);
  if (del && req.method === "DELETE") {
    const ok = await bot.db.remove(chatId, Number(del[1]));
    return ok ? json({ ok: true }) : json({ error: "not found" }, 404);
  }

  return json({ error: "not found" }, 404);
}
