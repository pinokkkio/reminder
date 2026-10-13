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

/**
 * Служебные модули (tick, setup) запускаются только через `npx tgcloud run`.
 * Через HTTP платформа всегда передаёт проверенную initData, а `run` — нет,
 * поэтому её наличие означает вызов из мини-приложения.
 */
export function assertInternal(ctx) {
  if (ctx?.initData) throw new EndpointError('Недоступно', { code: 'INTERNAL_ONLY' });
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
