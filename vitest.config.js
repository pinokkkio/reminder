import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Модули tgcloud/ импортируют платформенный `sdk`; в тестах его заменяет фейк на node:sqlite.
export default defineConfig({
  resolve: {
    alias: [{ find: /^sdk(\/(db|api|fetch))?$/, replacement: fileURLToPath(new URL('./test/fake-sdk.js', import.meta.url)) }],
  },
});
