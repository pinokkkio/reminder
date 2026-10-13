// Обращения к управляющему API Telegram Serverless через модули @tgcloud/cli.
// Это внутренние модули CLI, поэтому версия CLI закреплена в package.json точно:
// при обновлении проверьте, что эти функции не изменились.

export { applyMigration, getWebhook } from '@tgcloud/cli/src/api/endpoints.js';

export function requireToken() {
  const token = process.env.TGCLOUD_TOKEN;
  if (!token || !/^app\d+:[A-Za-z0-9_-]+$/.test(token)) {
    console.error('TGCLOUD_TOKEN не задан или имеет неверный формат (ожидается app<id>:<secret>)');
    process.exit(1);
  }
  return token;
}

/** Адрес мини-приложения: https://app<id>.tgcloud.ai/ (или MINI_APP_URL, если задан явно). */
export function miniAppUrl(token) {
  if (process.env.MINI_APP_URL) return process.env.MINI_APP_URL.replace(/\/?$/, '/');
  return token ? `https://${token.split(':')[0]}.tgcloud.ai/` : '';
}

/** Пишет markdown в сводку шага GitHub Actions (если запущено там) и в stdout. */
export async function summary(markdown) {
  console.log(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + '\n');
  }
}
