// POST /api/createReminder
//   { text }                     — свободный текст, разбирается как в чате
//   { text, at, repeat? }        — из формы: at = UTC ms, repeat = { unit, every, weekdays? }

import { EndpointError } from 'sdk';
import { parseReminder } from '../lib/parser.js';
import { alignToWeekdays, nextOccurrence, normalizeRepeat, validateRepeat } from '../lib/repeat.js';
import * as store from '../lib/store.js';
import { reminderView, userId } from '../lib/webapp.js';

export default async function (input, ctx) {
  const chatId = userId(ctx);
  const text = String(input.text ?? '').trim().slice(0, 1000);
  if (!text) throw new EndpointError('Введите текст напоминания', { code: 'EMPTY' });
  if (!(await store.canAdd(chatId))) throw new EndpointError('Слишком много активных напоминаний', { code: 'LIMIT' });

  const tz = await store.getTz(chatId);
  const now = Date.now();
  let at;
  let repeat;
  let finalText = text;

  if (input.at === undefined || input.at === null) {
    const parsed = parseReminder(text, now, tz);
    if (!parsed.ok) throw new EndpointError(parsed.error, { code: 'PARSE' });
    ({ at, repeat } = parsed);
    finalText = parsed.text;
  } else {
    at = Math.round(Number(input.at) / 60_000) * 60_000;
    const rep = validateRepeat(input.repeat);
    if (!Number.isFinite(at) || rep === undefined) throw new EndpointError('Некорректные данные', { code: 'BAD_INPUT' });
    if (rep) at = alignToWeekdays(at, rep, tz);
    repeat = rep ? normalizeRepeat(rep, at, tz) : null;
    if (at <= now) {
      if (!repeat) throw new EndpointError('Это время уже прошло', { code: 'PAST' });
      at = nextOccurrence(at, repeat, tz, now);
    }
  }

  const id = await store.addReminder(chatId, finalText, at, repeat, tz);
  return { reminder: reminderView(await store.getReminder(id)) };
}
