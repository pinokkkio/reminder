// handlers/callback_query.js — нажатия на inline-кнопки.

import { onCallback } from '../lib/bot.js';
import { deliverDueQuietly } from '../lib/scheduler.js';

export default async function (query, ctx) {
  try {
    await onCallback(query);
  } finally {
    await deliverDueQuietly();
  }
}
