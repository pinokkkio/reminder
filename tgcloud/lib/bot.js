// Логика чата: команды, разбор напоминаний, кнопки.

import { api } from 'sdk';
import { HELP, appKeyboard, confirmationText, edit, escapeHtml, listView, send } from './messages.js';
import { parseReminder } from './parser.js';
import * as store from './store.js';
import { formatDateTime, normalizeTimeZone } from './time.js';

export async function onMessage(msg) {
  const text = msg.text?.trim();
  if (!text) return;
  const chatId = msg.chat.id;
  const isPrivate = msg.chat.type === 'private';

  const cmd = /^\/([a-z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i.exec(text);
  if (cmd) return onCommand(msg, cmd[1].toLowerCase(), (cmd[2] ?? '').trim());

  // В группах реагируем только на «напомни …», чтобы не разбирать всю переписку
  if (!isPrivate && !/^напомн/i.test(text)) return;
  await createFromText(chatId, text);
}

async function onCommand(msg, name, arg) {
  const chatId = msg.chat.id;
  switch (name) {
    case 'start':
      return send(chatId, `👋 Привет!\n\n${HELP}`, appKeyboard(msg.chat.type));
    case 'help':
      return send(chatId, HELP);
    case 'app': {
      const kb = appKeyboard(msg.chat.type);
      return send(chatId, kb ? 'Управляйте напоминаниями в приложении:' : 'Мини-приложение доступно в личном чате с ботом.', kb);
    }
    case 'list': {
      const view = listView(await store.listReminders(chatId));
      return send(chatId, view.text, view.keyboard);
    }
    case 'tz':
      return onTz(chatId, arg);
    case 'del':
    case 'delete': {
      const id = Number(arg.replace(/^#/, ''));
      const ok = id > 0 && (await store.removeReminder(chatId, id));
      return send(chatId, ok ? `🗑 Напоминание #${id} удалено.` : 'Не нашёл такое напоминание. Посмотрите /list.');
    }
    default:
      if (msg.chat.type === 'private') return send(chatId, 'Не знаю такой команды. /help — справка.');
  }
}

async function createFromText(chatId, text) {
  const tz = await store.getTz(chatId);
  const parsed = parseReminder(text, Date.now(), tz);
  if (!parsed.ok) return send(chatId, `🤔 ${escapeHtml(parsed.error)}\n\n/help — примеры.`);
  if (!(await store.canAdd(chatId))) {
    return send(chatId, 'Слишком много активных напоминаний. Удалите ненужные через /list.');
  }
  const id = await store.addReminder(chatId, parsed.text, parsed.at, parsed.repeat, tz);
  await send(
    chatId,
    confirmationText({ id, chat_id: chatId, text: parsed.text, next_at: parsed.at, repeat: parsed.repeat, tz, active: 1 }),
    [[{ text: '↩️ Отменить', callback_data: `undo:${id}` }]],
  );
}

async function onTz(chatId, arg) {
  if (!arg) {
    const tz = await store.getTz(chatId);
    return send(
      chatId,
      `Ваш часовой пояс: <b>${escapeHtml(tz)}</b>\nСейчас там: ${escapeHtml(formatDateTime(Date.now(), tz))}\n\n` +
        'Изменить: <code>/tz Europe/Moscow</code>, <code>/tz Asia/Yekaterinburg</code> или <code>/tz +3</code>',
    );
  }
  const tz = normalizeTimeZone(arg);
  if (!tz) return send(chatId, 'Не знаю такого часового пояса. Пример: <code>/tz Europe/Moscow</code> или <code>/tz +3</code>');
  await store.setTz(chatId, tz);
  return send(
    chatId,
    `🌍 Часовой пояс: <b>${escapeHtml(tz)}</b> (сейчас ${escapeHtml(formatDateTime(Date.now(), tz))}).\n` +
      'Новые напоминания будут считаться по нему.',
  );
}

export async function onCallback(q) {
  const msg = q.message;
  const [action, idStr, arg] = (q.data ?? '').split(':');
  const id = Number(idStr);
  const answer = (text) => api.answerCallbackQuery({ callback_query_id: q.id, ...(text ? { text } : {}) });
  if (!msg || !id) return answer();
  const chatId = msg.chat.id;
  const original = escapeHtml(msg.text ?? '');

  switch (action) {
    case 'del': {
      const ok = await store.removeReminder(chatId, id);
      await answer(ok ? 'Удалено' : 'Уже удалено');
      const view = listView(await store.listReminders(chatId));
      return edit(chatId, msg.message_id, view.text, view.keyboard);
    }
    case 'undo':
    case 'off': {
      const ok = await store.removeReminder(chatId, id);
      await answer(ok ? 'Удалено' : 'Уже удалено');
      if (!ok) return;
      const note = action === 'undo' ? '↩️ Напоминание отменено.' : '🔕 Повторы отключены, напоминание удалено.';
      return edit(chatId, msg.message_id, `${original}\n\n${note}`);
    }
    case 'snz': {
      const minutes = Math.min(Math.max(Number(arg) || 10, 1), 7 * 24 * 60);
      const src = await store.getReminder(id);
      if (!src || src.chat_id !== chatId) return answer('Напоминание не найдено');
      if (!(await store.canAdd(chatId))) return answer('Слишком много напоминаний');
      const at = Math.round((Date.now() + minutes * 60_000) / 60_000) * 60_000;
      await store.addReminder(chatId, src.text, at, null, src.tz);
      const when = formatDateTime(at, src.tz);
      await answer(`Напомню ${when}`);
      return edit(chatId, msg.message_id, `${original}\n\n⏰ Отложено до ${escapeHtml(when)}`);
    }
    default:
      return answer();
  }
}
