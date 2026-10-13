// Настройка бота после деплоя: команды и кнопка меню с мини-приложением.
// Запускается из CD: npx tgcloud run endpoints/setup. Идемпотентно.

import { api } from 'sdk';
import { BOT_COMMANDS, ENVIRONMENT, MINI_APP_URL, VERSION } from '../lib/config.js';
import { assertInternal } from '../lib/webapp.js';

export default async function (input, ctx) {
  assertInternal(ctx);
  await api.setMyCommands({ commands: BOT_COMMANDS });
  if (MINI_APP_URL) {
    await api.setChatMenuButton({
      menu_button: { type: 'web_app', text: 'Напоминания', web_app: { url: MINI_APP_URL } },
    });
  }
  const me = await api.getMe();
  return { bot: me.username, environment: ENVIRONMENT, version: VERSION, menu: MINI_APP_URL || null };
}
