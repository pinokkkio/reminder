// Настройки бота.

// Часовой пояс по умолчанию для новых пользователей (меняется командой /tz).
export const DEFAULT_TZ = 'Europe/Moscow';

// Адрес мини-приложения — его печатает `npx tgcloud push` (вида https://app<id>.tgcloud.ai/).
// Если задан, бот показывает кнопку «Открыть приложение» в /start и /app.
export const MINI_APP_URL = '';

export const MAX_ACTIVE_PER_CHAT = 200;

// Сколько напоминаний отправлять за один проход планировщика.
export const DELIVERY_BATCH = 50;
