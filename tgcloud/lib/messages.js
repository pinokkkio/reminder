// Тексты, клавиатуры и отправка сообщений.

import { api, BotApiError } from 'sdk';
import { MINI_APP_URL } from './config.js';
import { describeRepeat } from './repeat.js';
import { formatDateTime } from './time.js';

export const HELP = `Я напоминаю о делах — разово или по расписанию.

<b>Просто напишите, например:</b>
• завтра в 10:30 позвонить маме
• через 2 часа выключить духовку
• 25 декабря в 18:00 купить подарки
• в пятницу в 19 кино
• каждый день в 9:00 зарядка
• по будням в 8:30 выпить таблетку
• каждый понедельник и четверг в 20:00 спортзал
• каждые 3 часа пить воду
• каждый месяц 15 числа в 12:00 оплатить интернет
• каждый год 1 марта поздравить сестру

В группах начинайте сообщение со слова «напомни».

<b>Команды:</b>
/list — мои напоминания
/tz — часовой пояс (например, <code>/tz Europe/Moscow</code> или <code>/tz +5</code>)
/app — открыть мини-приложение
/help — эта справка`;

export function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Кнопка мини-приложения (web_app-кнопки работают только в личных чатах). */
export function appKeyboard(chatType) {
  if (!MINI_APP_URL || chatType !== 'private') return undefined;
  return [[{ text: '📱 Открыть приложение', web_app: { url: MINI_APP_URL } }]];
}

export function send(chatId, text, keyboard) {
  return api.sendMessage({
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
}

export async function edit(chatId, messageId, text, keyboard) {
  try {
    await api.editMessageText({
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: { inline_keyboard: keyboard ?? [] },
    });
  } catch (e) {
    // «message is not modified» и удалённые сообщения — не ошибка
    if (!(e instanceof BotApiError && e.code === 400)) throw e;
  }
}

/** @param {import('./store.js').Reminder} r */
export function confirmationText(r) {
  return (
    `✅ Напомню <b>${escapeHtml(formatDateTime(r.next_at, r.tz))}</b>` +
    (r.repeat ? `\n🔁 ${describeRepeat(r.repeat)}` : '') +
    `\n📝 ${escapeHtml(r.text)}`
  );
}

/** @param {import('./store.js').Reminder[]} items */
export function listView(items) {
  if (!items.length) return { text: 'У вас нет активных напоминаний.', keyboard: [] };
  const shown = items.slice(0, 50);
  const lines = shown.map((r) => {
    const rep = r.repeat ? ` · 🔁 ${describeRepeat(r.repeat)}` : '';
    return `<b>#${r.id}</b> ${escapeHtml(formatDateTime(r.next_at, r.tz))}${rep}\n${escapeHtml(r.text)}`;
  });
  const keyboard = [];
  for (let i = 0; i < shown.length; i += 4) {
    keyboard.push(shown.slice(i, i + 4).map((r) => ({ text: `🗑 #${r.id}`, callback_data: `del:${r.id}` })));
  }
  const more = items.length > shown.length ? `\n\n…и ещё ${items.length - shown.length}` : '';
  return { text: `📋 <b>Ваши напоминания</b>\n\n${lines.join('\n\n')}${more}`, keyboard };
}

/** Само напоминание с кнопками «Отложить» и «Больше не напоминать». */
export function deliver(r) {
  const keyboard = [[
    { text: '⏰ 10 мин', callback_data: `snz:${r.id}:10` },
    { text: '1 час', callback_data: `snz:${r.id}:60` },
    { text: 'Завтра', callback_data: `snz:${r.id}:1440` },
  ]];
  if (r.repeat) keyboard.push([{ text: '🔕 Больше не напоминать', callback_data: `off:${r.id}` }]);
  const footer = r.repeat ? `\n\n<i>🔁 ${describeRepeat(r.repeat)}</i>` : '';
  return send(r.chat_id, `🔔 ${escapeHtml(r.text)}${footer}`, keyboard);
}
