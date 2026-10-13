// Рассылка наступивших напоминаний.
//
// У Telegram Serverless нет встроенного cron, поэтому deliverDue() вызывается:
//  • в конце обработки каждого апдейта и каждого запроса мини-приложения;
//  • внешним «будильником» — эндпоинтом endpoints/tick (см. README).
// Повторные и параллельные вызовы безопасны: напоминание сначала атомарно
// «забирается» (claimReminder), и только потом отправляется.

import { BotApiError } from 'sdk';
import { DELIVERY_BATCH } from './config.js';
import { deliver } from './messages.js';
import { nextOccurrence } from './repeat.js';
import * as store from './store.js';

export async function deliverDue(now = Date.now()) {
  let sent = 0;
  let failed = 0;
  const due = await store.dueReminders(now, DELIVERY_BATCH);

  for (const r of due) {
    const next = r.repeat ? nextOccurrence(r.next_at, r.repeat, r.tz, now) : null;
    if (!(await store.claimReminder(r, next))) continue; // уже отправляет другой запуск

    try {
      await deliver(r);
      sent++;
    } catch (e) {
      failed++;
      if (e instanceof BotApiError && e.code === 403) {
        // Пользователь заблокировал бота — дальше слать бессмысленно
        await store.deactivateChat(r.chat_id);
      } else if (e instanceof BotApiError && e.code === 400) {
        // Чат не найден и т. п. — повтор не поможет
        await store.deactivateReminder(r.id);
      } else {
        // Временная ошибка (429, сеть): вернём как было, отправим в следующий раз
        await store.restoreReminder(r);
        console.warn('delivery failed, will retry', { id: r.id, error: String(e) });
        break;
      }
    }
  }

  if (sent && Math.random() < 0.05) await store.purgeInactive(now);
  return { sent, failed, pending: due.length === DELIVERY_BATCH };
}

/** Для вызова в конце обработчиков: ошибки рассылки не должны ломать ответ пользователю. */
export async function deliverDueQuietly() {
  try {
    await deliverDue();
  } catch (e) {
    console.error('deliverDue failed', e);
  }
}
