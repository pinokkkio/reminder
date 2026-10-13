// Общее для эндпоинтов мини-приложения.

import { EndpointError } from 'sdk';
import { describeRepeat } from './repeat.js';
import { formatDateTime } from './time.js';

/** id пользователя мини-приложения (initData проверена платформой). */
export function userId(ctx) {
  const id = ctx?.initData?.user?.id;
  if (typeof id !== 'number') throw new EndpointError('Откройте приложение из Telegram', { code: 'NO_USER' });
  return id;
}

/** @param {import('./store.js').Reminder} r */
export function reminderView(r) {
  return {
    id: r.id,
    text: r.text,
    next_at: r.next_at,
    next_text: formatDateTime(r.next_at, r.tz),
    repeat: r.repeat,
    repeat_text: r.repeat ? describeRepeat(r.repeat) : null,
  };
}
