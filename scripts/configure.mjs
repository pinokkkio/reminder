#!/usr/bin/env node
// Записывает tgcloud/lib/deploy-info.js перед деплоем: окружение, версию и адрес мини-приложения.
//   DEPLOY_ENV      — staging | production
//   DEPLOY_VERSION  — по умолчанию короткий GITHUB_SHA
//   TGCLOUD_TOKEN   — из него вычисляется https://app<id>.tgcloud.ai/ (или задайте MINI_APP_URL)

import { writeFileSync } from 'node:fs';
import { miniAppUrl } from './lib/tgcloud.mjs';

const env = process.env.DEPLOY_ENV || 'local';
const version = process.env.DEPLOY_VERSION || (process.env.GITHUB_SHA ?? 'dev').slice(0, 7);
const url = miniAppUrl(process.env.TGCLOUD_TOKEN);
if (url && !/^https:\/\/[^\s'"`]+\/$/.test(url)) {
  console.error(`Некорректный адрес мини-приложения: ${url}`);
  process.exit(1);
}

writeFileSync(
  new URL('../tgcloud/lib/deploy-info.js', import.meta.url),
  `// Сгенерировано scripts/configure.mjs при деплое.\n\n` +
    `export const ENVIRONMENT = ${JSON.stringify(env)};\n` +
    `export const VERSION = ${JSON.stringify(version)};\n` +
    `export const MINI_APP_URL = ${JSON.stringify(url)};\n`,
);
console.log(`deploy-info: ${env} ${version} ${url || '(без мини-приложения)'}`);
