#!/usr/bin/env node
// Smoke-тест задеплоенного окружения:
//   1. мини-приложение отдаётся по https://app<id>.tgcloud.ai/;
//   2. эндпоинт задеплоен и требует initData (401, а не 404);
//   3. вебхук бота указывает на платформу и совпадает с хендлерами.

import { getWebhook, miniAppUrl, requireToken, summary } from './lib/tgcloud.mjs';

const token = requireToken();
const base = miniAppUrl(token);
const results = [];

async function check(name, fn) {
  // Платформе может понадобиться несколько секунд, чтобы раздать новую версию
  let last;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const detail = await fn();
      results.push({ name, ok: true, detail });
      return;
    } catch (e) {
      last = e;
      if (attempt < 5) await new Promise((r) => setTimeout(r, attempt * 3000));
    }
  }
  results.push({ name, ok: false, detail: last?.message ?? String(last) });
}

await check('Мини-приложение', async () => {
  const res = await fetch(base);
  const body = await res.text();
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  if (!body.includes('Напоминания')) throw new Error('страница не похожа на мини-приложение');
  return `${base} → 200`;
});

await check('Эндпоинт listReminders', async () => {
  const res = await fetch(new URL('api/listReminders', base), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  if (res.status !== 401) throw new Error(`без initData ожидался 401, получен ${res.status}`);
  return 'без initData → 401';
});

await check('Вебхук', async () => {
  const wh = await getWebhook(token);
  if (!wh.in_sync) throw new Error(`не синхронизирован: ${wh.url || '(пусто)'}`);
  const err = wh.last_error_date && Date.now() / 1000 - wh.last_error_date < 600 ? `, последняя ошибка: ${wh.last_error_message}` : '';
  return `в порядке, в очереди ${wh.pending_update_count ?? 0}${err}`;
});

const env = process.env.DEPLOY_ENV ? ` (${process.env.DEPLOY_ENV})` : '';
await summary(
  `### Smoke-тест${env}\n\n| | Проверка | Результат |\n|---|---|---|\n` +
    results.map((r) => `| ${r.ok ? '✅' : '❌'} | ${r.name} | ${r.detail} |`).join('\n'),
);
if (results.some((r) => !r.ok)) process.exit(1);
