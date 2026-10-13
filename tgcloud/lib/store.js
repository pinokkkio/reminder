// Доступ к базе. Сырые SQL-запросы: строки приходят без преобразований типов.

import { db } from 'sdk';
import { DEFAULT_TZ, MAX_ACTIVE_PER_CHAT } from './config.js';
import { parseRepeat } from './repeat.js';

/**
 * @typedef {{ id: number, chat_id: number, text: string, next_at: number,
 *   repeat: import('./repeat.js').Repeat | null, tz: string, active: number }} Reminder
 */

const DAY_MS = 24 * 3600 * 1000;

/** @returns {Reminder} */
function toReminder(row) {
  return {
    id: Number(row.id),
    chat_id: Number(row.chat_id),
    text: row.text,
    next_at: Number(row.next_at),
    repeat: parseRepeat(row.repeat_rule),
    tz: row.tz,
    active: Number(row.active),
  };
}

export async function getTz(chatId) {
  const row = await db.get('SELECT tz FROM users WHERE chat_id = :chat', { ':chat': chatId });
  return row?.tz ?? DEFAULT_TZ;
}

export async function setTz(chatId, tz) {
  await db.run(
    'INSERT INTO users (chat_id, tz, created_at) VALUES (:chat, :tz, :now) ON CONFLICT(chat_id) DO UPDATE SET tz = excluded.tz',
    { ':chat': chatId, ':tz': tz, ':now': Date.now() },
  );
}

export async function canAdd(chatId) {
  const row = await db.get('SELECT COUNT(*) AS n FROM reminders WHERE chat_id = :chat AND active = 1', { ':chat': chatId });
  return Number(row?.n ?? 0) < MAX_ACTIVE_PER_CHAT;
}

/** @returns {Promise<number>} id нового напоминания */
export async function addReminder(chatId, text, nextAt, repeat, tz) {
  const res = await db.run(
    `INSERT INTO reminders (chat_id, text, next_at, repeat_rule, tz, active, created_at)
     VALUES (:chat, :text, :next, :repeat, :tz, 1, :now)`,
    {
      ':chat': chatId,
      ':text': text,
      ':next': nextAt,
      ':repeat': repeat ? JSON.stringify(repeat) : null,
      ':tz': tz,
      ':now': Date.now(),
    },
  );
  return Number(res.lastInsertRowid);
}

/** @returns {Promise<Reminder | null>} */
export async function getReminder(id) {
  const row = await db.get('SELECT * FROM reminders WHERE id = :id', { ':id': id });
  return row ? toReminder(row) : null;
}

/** @returns {Promise<Reminder[]>} */
export async function listReminders(chatId) {
  const rows = await db.all(
    'SELECT * FROM reminders WHERE chat_id = :chat AND active = 1 ORDER BY next_at LIMIT :limit',
    { ':chat': chatId, ':limit': MAX_ACTIVE_PER_CHAT },
  );
  return rows.map(toReminder);
}

/** Удаляет напоминание, только если оно принадлежит chatId. */
export async function removeReminder(chatId, id) {
  const res = await db.run('DELETE FROM reminders WHERE id = :id AND chat_id = :chat', { ':id': id, ':chat': chatId });
  return res.rowsAffected > 0;
}

/** @returns {Promise<Reminder[]>} */
export async function dueReminders(now, limit) {
  const rows = await db.all(
    'SELECT * FROM reminders WHERE active = 1 AND next_at <= :now ORDER BY next_at LIMIT :limit',
    { ':now': now, ':limit': limit },
  );
  return rows.map(toReminder);
}

/**
 * Атомарно «забирает» напоминание на отправку: переводит его в следующее
 * состояние, только если его ещё не забрал параллельный запуск.
 * nextAt = null — разовое, деактивируется.
 */
export async function claimReminder(r, nextAt) {
  const res = await db.run(
    `UPDATE reminders SET next_at = :next, active = :active
     WHERE id = :id AND active = 1 AND next_at = :old`,
    { ':next': nextAt ?? r.next_at, ':active': nextAt === null ? 0 : 1, ':id': r.id, ':old': r.next_at },
  );
  return res.rowsAffected > 0;
}

/** Возвращает напоминание в исходное состояние после временной ошибки отправки. */
export async function restoreReminder(r) {
  await db.run('UPDATE reminders SET next_at = :old, active = 1 WHERE id = :id', { ':old': r.next_at, ':id': r.id });
}

export async function deactivateReminder(id) {
  await db.run('UPDATE reminders SET active = 0 WHERE id = :id', { ':id': id });
}

export async function deactivateChat(chatId) {
  await db.run('UPDATE reminders SET active = 0 WHERE chat_id = :chat', { ':chat': chatId });
}

/** Сработавшие разовые напоминания храним 30 дней (для кнопок «Отложить»), потом удаляем. */
export async function purgeInactive(now) {
  await db.run('DELETE FROM reminders WHERE active = 0 AND next_at < :before', { ':before': now - 30 * DAY_MS });
}
