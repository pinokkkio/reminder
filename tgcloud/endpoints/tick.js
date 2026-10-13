// «Будильник»: отправляет наступившие напоминания.
//
// У Telegram Serverless нет встроенного cron, поэтому этот модуль периодически
// запускают снаружи: npx tgcloud run endpoints/tick (см. .github/workflows/tick.yml).
// Вызывать его может кто угодно — он лишь отправляет то, что и так пора отправить.

import { deliverDue } from '../lib/scheduler.js';

export default async function (input, ctx) {
  let total = { sent: 0, failed: 0 };
  // Несколько проходов, если накопилось больше одной пачки
  for (let i = 0; i < 5; i++) {
    const { sent, failed, pending } = await deliverDue();
    total = { sent: total.sent + sent, failed: total.failed + failed };
    if (!pending || failed) break;
  }
  if (total.sent || total.failed) console.info('tick', total);
  return total;
}
