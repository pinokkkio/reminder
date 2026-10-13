#!/usr/bin/env node
// Статическая проверка правил рантайма Telegram Serverless для модулей в tgcloud/.
// Ловит то, что иначе всплыло бы только после деплоя:
//   • импорты: только 'sdk', 'sdk/<sub>' или относительные пути с .js внутри tgcloud/;
//   • нет require(), process, node:-модулей (в рантайме их нет);
//   • handlers/ — только типы апдейтов Bot API, endpoints/ — допустимые имена, без подпапок;
//   • в schema.js нет внешних ключей (платформа их не принимает);
//   • синтаксис каждого модуля.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const ROOT = resolve(process.argv[2] ?? 'tgcloud');
const SDK_MODULES = new Set(['sdk', 'sdk/db', 'sdk/api', 'sdk/fetch']);
const UPDATE_TYPES = new Set([
  'message', 'edited_message', 'channel_post', 'edited_channel_post', 'business_connection',
  'business_message', 'edited_business_message', 'deleted_business_messages', 'message_reaction',
  'message_reaction_count', 'inline_query', 'chosen_inline_result', 'callback_query', 'shipping_query',
  'pre_checkout_query', 'purchased_paid_media', 'poll', 'poll_answer', 'my_chat_member', 'chat_member',
  'chat_join_request', 'chat_boost', 'removed_chat_boost',
]);

const errors = [];
const fail = (file, msg) => errors.push(`${relative(process.cwd(), file)}: ${msg}`);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

if (!existsSync(join(ROOT, 'schema.js'))) fail(ROOT, 'нет schema.js');

for (const dir of ['handlers', 'endpoints']) {
  const base = join(ROOT, dir);
  if (!existsSync(base)) continue;
  for (const name of readdirSync(base)) {
    const p = join(base, name);
    if (statSync(p).isDirectory()) { fail(p, `в ${dir}/ не допускаются подпапки`); continue; }
    if (!name.endsWith('.js')) continue;
    const mod = name.slice(0, -3);
    if (dir === 'handlers' && !UPDATE_TYPES.has(mod)) fail(p, `"${mod}" — не тип апдейта Bot API`);
    if (dir === 'endpoints' && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(mod)) fail(p, `недопустимое имя эндпоинта "${mod}"`);
  }
}

const files = walk(ROOT).filter((f) => f.endsWith('.js'));
const importRe = /(?:^|[\s;])(?:import|export)\s[^'"`]*?from\s*['"]([^'"]+)['"]|(?:^|[\s;])import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');

  // Модули платформы — ES-модули; через stdin с --input-type=module, иначе Node
  // в каталоге без "type": "module" может не распознать формат
  const check = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: src, encoding: 'utf8' });
  if (check.status !== 0) fail(file, `синтаксическая ошибка: ${check.stderr.split('\n').find((l) => l.startsWith('SyntaxError')) ?? check.stderr.trim()}`);

  for (const m of code.matchAll(importRe)) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (SDK_MODULES.has(spec)) continue;
    if (!spec.startsWith('.')) { fail(file, `импорт "${spec}": в рантайме есть только sdk и модули проекта`); continue; }
    if (!spec.endsWith('.js')) { fail(file, `импорт "${spec}": относительный путь должен оканчиваться на .js`); continue; }
    const target = resolve(dirname(file), spec);
    if (!target.startsWith(ROOT + sep)) fail(file, `импорт "${spec}" выходит за пределы tgcloud/`);
    else if (!existsSync(target)) fail(file, `импорт "${spec}": файл не найден`);
  }

  if (/\brequire\s*\(/.test(code)) fail(file, 'require() недоступен — используйте import');
  if (/\bprocess\s*\./.test(code)) fail(file, 'process недоступен в рантайме');
  if (/['"]node:/.test(code)) fail(file, 'модули node: недоступны в рантайме');
}

const schema = join(ROOT, 'schema.js');
if (existsSync(schema) && /\.references\s*\(|\bforeignKey\s*\(/.test(readFileSync(schema, 'utf8'))) {
  fail(schema, 'внешние ключи не поддерживаются платформой (.references / foreignKey)');
}

if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join('\n'));
  console.error(`\n${errors.length} ошибок`);
  process.exit(1);
}
console.log(`✓ ${files.length} модулей соответствуют правилам платформы`);
