// Перезаписывается при деплое из CI (scripts/configure.mjs). Локально — значения по умолчанию.

export const ENVIRONMENT = 'local';
export const VERSION = 'dev';

// Адрес мини-приложения, https://app<id>.tgcloud.ai/. CI вычисляет его из токена;
// при ручном деплое впишите адрес, который печатает `npx tgcloud push`.
export const MINI_APP_URL = '';
