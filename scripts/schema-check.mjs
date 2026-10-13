#!/usr/bin/env node
// План миграции: сравнивает локальный tgcloud/schema.js с базой окружения (ничего не применяет).
//
// Изменения со статусом good (новые таблицы, колонки, индексы) CD применяет сам
// (`tgcloud migrate --safe`). warning (удаления) и manual (смена типов) — опасные:
// деплой останавливается, пока их не применят вручную (`npx tgcloud migrate`)
// или не разрешат явно: ALLOW_UNSAFE_MIGRATIONS=true.
//
//   --report-only   только отчёт, без ненулевого кода выхода (для PR)

import { readFileSync } from 'node:fs';
import { applyMigration, requireToken, summary } from './lib/tgcloud.mjs';

const reportOnly = process.argv.includes('--report-only');
const allowUnsafe = process.env.ALLOW_UNSAFE_MIGRATIONS === 'true';
const label = process.env.DEPLOY_ENV ? ` (${process.env.DEPLOY_ENV})` : '';
const token = requireToken();
const schema = readFileSync(new URL('../tgcloud/schema.js', import.meta.url), 'utf8');

let changes;
try {
  ({ db_changes: changes = [] } = await applyMigration(token, { schema, dry_run: true }));
} catch (e) {
  console.error(`Не удалось получить план миграции: ${e.description || e.message}`);
  process.exit(1);
}

const target = (c) => [c.table, c.column ?? c.index].filter(Boolean).join('.');
const ICON = { good: '🟢', warning: '🟠', manual: '🔴', undocumented: '⚪' };
const unsafe = changes.filter((c) => c.status === 'warning' || c.status === 'manual');

if (!changes.length) {
  await summary(`### Схема БД${label}\n\nИзменений нет.`);
} else {
  await summary(
    `### Схема БД${label}\n\n| | Изменение | Объект | Статус |\n|---|---|---|---|\n` +
      changes.map((c) => `| ${ICON[c.status] ?? '·'} | ${c.kind} | \`${target(c)}\` | ${c.status} |`).join('\n') +
      (unsafe.length
        ? `\n\n**${unsafe.length} опасных изменений.** CD их не применяет: выполните \`npx tgcloud migrate\` вручную ` +
          'или запустите деплой с `allow_unsafe_migrations`.'
        : '\n\nВсе изменения безопасные — CD применит их автоматически.'),
  );
}

if (unsafe.length && !allowUnsafe && !reportOnly) process.exit(1);
