// POST /api/setTimezone { tz }

import { EndpointError } from 'sdk';
import * as store from '../lib/store.js';
import { normalizeTimeZone } from '../lib/time.js';
import { userId } from '../lib/webapp.js';

export default async function (input, ctx) {
  const chatId = userId(ctx);
  const tz = input.tz ? normalizeTimeZone(input.tz) : null;
  if (!tz) throw new EndpointError('Неизвестный часовой пояс', { code: 'BAD_TZ' });
  await store.setTz(chatId, tz);
  return { tz };
}
