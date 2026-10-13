// POST /api/listReminders → { tz, reminders }

import { deliverDueQuietly } from '../lib/scheduler.js';
import * as store from '../lib/store.js';
import { reminderView, userId } from '../lib/webapp.js';

export default async function (input, ctx) {
  const chatId = userId(ctx);
  await deliverDueQuietly();
  const [tz, items] = await Promise.all([store.getTz(chatId), store.listReminders(chatId)]);
  return { tz, reminders: items.map(reminderView) };
}
