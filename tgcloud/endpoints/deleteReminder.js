// POST /api/deleteReminder { id }

import { EndpointError } from 'sdk';
import * as store from '../lib/store.js';
import { userId } from '../lib/webapp.js';

export default async function (input, ctx) {
  const chatId = userId(ctx);
  const ok = await store.removeReminder(chatId, Number(input.id));
  if (!ok) throw new EndpointError('Напоминание не найдено', { code: 'NOT_FOUND' });
  return { ok: true };
}
