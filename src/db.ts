import type { Repeat } from "./repeat";
import { parseRepeat } from "./repeat";

export interface Reminder {
  id: number;
  chat_id: number;
  text: string;
  next_at: number;
  repeat: Repeat | null;
  tz: string;
  active: number;
}

interface ReminderRow extends Omit<Reminder, "repeat"> {
  repeat: string | null;
}

const MAX_ACTIVE_PER_CHAT = 200;

function toReminder(r: ReminderRow): Reminder {
  return { ...r, repeat: parseRepeat(r.repeat) };
}

export class Db {
  constructor(private db: D1Database, private defaultTz: string) {}

  async getTz(chatId: number): Promise<string> {
    const row = await this.db.prepare("SELECT tz FROM users WHERE chat_id = ?").bind(chatId).first<{ tz: string }>();
    return row?.tz ?? this.defaultTz;
  }

  async setTz(chatId: number, tz: string): Promise<void> {
    await this.db
      .prepare("INSERT INTO users (chat_id, tz, created_at) VALUES (?, ?, ?) ON CONFLICT(chat_id) DO UPDATE SET tz = excluded.tz")
      .bind(chatId, tz, Date.now())
      .run();
  }

  async ensureUser(chatId: number): Promise<void> {
    await this.db
      .prepare("INSERT OR IGNORE INTO users (chat_id, tz, created_at) VALUES (?, ?, ?)")
      .bind(chatId, this.defaultTz, Date.now())
      .run();
  }

  async countActive(chatId: number): Promise<number> {
    const row = await this.db
      .prepare("SELECT COUNT(*) AS n FROM reminders WHERE chat_id = ? AND active = 1")
      .bind(chatId)
      .first<{ n: number }>();
    return row?.n ?? 0;
  }

  async canAdd(chatId: number): Promise<boolean> {
    return (await this.countActive(chatId)) < MAX_ACTIVE_PER_CHAT;
  }

  async add(chatId: number, text: string, nextAt: number, repeat: Repeat | null, tz: string): Promise<number> {
    const row = await this.db
      .prepare("INSERT INTO reminders (chat_id, text, next_at, repeat, tz, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?) RETURNING id")
      .bind(chatId, text, nextAt, repeat ? JSON.stringify(repeat) : null, tz, Date.now())
      .first<{ id: number }>();
    return row!.id;
  }

  async get(id: number): Promise<Reminder | null> {
    const row = await this.db.prepare("SELECT * FROM reminders WHERE id = ?").bind(id).first<ReminderRow>();
    return row ? toReminder(row) : null;
  }

  async list(chatId: number): Promise<Reminder[]> {
    const { results } = await this.db
      .prepare("SELECT * FROM reminders WHERE chat_id = ? AND active = 1 ORDER BY next_at LIMIT ?")
      .bind(chatId, MAX_ACTIVE_PER_CHAT)
      .all<ReminderRow>();
    return results.map(toReminder);
  }

  /** Удаляет напоминание, только если оно принадлежит chatId. */
  async remove(chatId: number, id: number): Promise<boolean> {
    const res = await this.db.prepare("DELETE FROM reminders WHERE id = ? AND chat_id = ?").bind(id, chatId).run();
    return (res.meta.changes ?? 0) > 0;
  }

  async due(now: number, limit = 100): Promise<Reminder[]> {
    const { results } = await this.db
      .prepare("SELECT * FROM reminders WHERE active = 1 AND next_at <= ? ORDER BY next_at LIMIT ?")
      .bind(now, limit)
      .all<ReminderRow>();
    return results.map(toReminder);
  }

  async reschedule(id: number, nextAt: number): Promise<void> {
    await this.db.prepare("UPDATE reminders SET next_at = ? WHERE id = ?").bind(nextAt, id).run();
  }

  async deactivate(id: number): Promise<void> {
    await this.db.prepare("UPDATE reminders SET active = 0 WHERE id = ?").bind(id).run();
  }

  async deactivateChat(chatId: number): Promise<void> {
    await this.db.prepare("UPDATE reminders SET active = 0 WHERE chat_id = ?").bind(chatId).run();
  }

  /** Сработавшие разовые напоминания храним 30 дней (для кнопок «Отложить»), потом чистим. */
  async purgeInactive(now: number): Promise<void> {
    await this.db
      .prepare("DELETE FROM reminders WHERE active = 0 AND next_at < ?")
      .bind(now - 30 * 24 * 3600 * 1000)
      .run();
  }
}
