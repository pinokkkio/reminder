import type { Bot } from "./bot";
import { nextOccurrence } from "./repeat";
import { TelegramError } from "./telegram";

/** Отправляет все наступившие напоминания и планирует следующие повторы. */
export async function runDue(bot: Bot, now = Date.now()): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (let batch = 0; batch < 10; batch++) {
    const due = await bot.db.due(now);
    if (!due.length) break;

    // Отправляем пачками, чтобы не упереться в лимиты Telegram (~30 сообщений/с)
    for (let i = 0; i < due.length; i += 20) {
      await Promise.all(
        due.slice(i, i + 20).map(async (r) => {
          try {
            await bot.deliver(r);
            sent++;
          } catch (e) {
            failed++;
            if (e instanceof TelegramError && (e.status === 403 || e.status === 400)) {
              // Бот заблокирован / чат удалён — дальше слать бессмысленно
              if (e.status === 403) await bot.db.deactivateChat(r.chat_id);
              else await bot.db.deactivate(r.id);
              return;
            }
            console.error(`reminder ${r.id}: ${e}`);
            // Временная ошибка: попробуем снова через минуту
            return;
          }
          if (r.repeat) await bot.db.reschedule(r.id, nextOccurrence(r.next_at, r.repeat, r.tz, now));
          else await bot.db.deactivate(r.id);
        }),
      );
    }
    // При временных ошибках не крутим цикл — повторим на следующем запуске cron
    if (failed || due.length < 100) break;
  }

  if (new Date(now).getUTCMinutes() === 0) await bot.db.purgeInactive(now);
  return { sent, failed };
}
