// handlers/message.js — каждое входящее сообщение.

import { onMessage } from '../lib/bot.js';
import { deliverDueQuietly } from '../lib/scheduler.js';

export default async function (message, ctx) {
  try {
    await onMessage(message);
  } finally {
    // Встроенного cron нет — пользуемся случаем и отправляем наступившие напоминания
    await deliverDueQuietly();
  }
}
