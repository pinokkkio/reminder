// Настройки бота.

// Часовой пояс по умолчанию для новых пользователей (меняется командой /tz).
export const DEFAULT_TZ = 'Europe/Moscow';

// Адрес мини-приложения и версия задаются при деплое — см. deploy-info.js.
// Если адрес задан, бот показывает кнопку «Открыть приложение» в /start и /app.
export { ENVIRONMENT, MINI_APP_URL, VERSION } from './deploy-info.js';

export const BOT_COMMANDS = [
  { command: 'list', description: 'Мои напоминания' },
  { command: 'tz', description: 'Часовой пояс' },
  { command: 'app', description: 'Открыть приложение' },
  { command: 'help', description: 'Справка и примеры' },
];

export const MAX_ACTIVE_PER_CHAT = 200;

// Сколько напоминаний отправлять за один проход планировщика.
export const DELIVERY_BATCH = 50;
