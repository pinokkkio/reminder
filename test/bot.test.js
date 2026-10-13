import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calls, db, failures, resetApi, resetDb } from './fake-sdk.js';
import * as schema from '../tgcloud/schema.js';
import onMessage from '../tgcloud/handlers/message.js';
import onCallback from '../tgcloud/handlers/callback_query.js';
import listReminders from '../tgcloud/endpoints/listReminders.js';
import createReminder from '../tgcloud/endpoints/createReminder.js';
import deleteReminder from '../tgcloud/endpoints/deleteReminder.js';
import setTimezone from '../tgcloud/endpoints/setTimezone.js';
import tick from '../tgcloud/endpoints/tick.js';
import setup from '../tgcloud/endpoints/setup.js';

const CHAT = 1001;
// Вторник, 13 октября 2026, 11:20 по Москве
const NOW = Date.UTC(2026, 9, 13, 8, 20);

const message = (text, chat = { id: CHAT, type: 'private' }) => ({ message_id: 1, chat, from: { id: CHAT }, text });
const sent = (method = 'sendMessage') => calls.filter((c) => c.method === method);
const lastText = () => sent().at(-1)?.params.text;
const ctx = { initData: { user: { id: CHAT, first_name: 'Ann' } } };
const rows = () => db.all('SELECT * FROM reminders ORDER BY id');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  resetDb(schema);
  resetApi();
});
afterEach(() => vi.useRealTimers());

describe('чат', () => {
  it('/start отвечает справкой', async () => {
    await onMessage(message('/start'));
    expect(lastText()).toContain('Привет');
  });

  it('создаёт напоминание из текста и подтверждает', async () => {
    await onMessage(message('завтра в 10:30 позвонить маме'));
    const [r] = await rows();
    expect(r).toMatchObject({ chat_id: CHAT, text: 'позвонить маме', active: 1, repeat_rule: null, tz: 'Europe/Moscow' });
    expect(r.next_at).toBe(Date.UTC(2026, 9, 14, 7, 30));
    expect(lastText()).toContain('14 октября 2026, 10:30');
    expect(sent().at(-1).params.reply_markup.inline_keyboard[0][0].callback_data).toBe(`undo:${r.id}`);
  });

  it('не понял — подсказывает', async () => {
    await onMessage(message('просто текст'));
    expect(await rows()).toHaveLength(0);
    expect(lastText()).toContain('Не нашёл, когда напомнить');
  });

  it('в группе реагирует только на «напомни»', async () => {
    const group = { id: -5, type: 'group' };
    await onMessage(message('завтра в 10 обед', group));
    expect(calls).toHaveLength(0);
    await onMessage(message('напомни завтра в 10 обед', group));
    expect(await rows()).toHaveLength(1);
  });

  it('/tz меняет часовой пояс', async () => {
    await onMessage(message('/tz +5'));
    expect(lastText()).toContain('Etc/GMT-5');
    await onMessage(message('завтра в 10:00 тест'));
    const [r] = await rows();
    expect(r.next_at).toBe(Date.UTC(2026, 9, 14, 5, 0));
  });

  it('/list и удаление кнопкой', async () => {
    await onMessage(message('завтра в 10 раз'));
    await onMessage(message('каждый день в 9:00 два'));
    await onMessage(message('/list'));
    expect(lastText()).toContain('раз');
    expect(lastText()).toContain('каждый день');

    const [first] = await rows();
    await onCallback({ id: 'q', data: `del:${first.id}`, message: { message_id: 7, chat: { id: CHAT }, text: '…' } });
    expect(await rows()).toHaveLength(1);
    expect(sent('editMessageText').at(-1).params.text).not.toContain('#' + first.id + ' ');
  });

  it('«Отменить» удаляет только своё напоминание', async () => {
    await onMessage(message('завтра в 10 раз'));
    const [r] = await rows();
    await onCallback({ id: 'q', data: `undo:${r.id}`, message: { message_id: 7, chat: { id: 999 }, text: '…' } });
    expect(await rows()).toHaveLength(1);
    await onCallback({ id: 'q', data: `undo:${r.id}`, message: { message_id: 7, chat: { id: CHAT }, text: '…' } });
    expect(await rows()).toHaveLength(0);
  });
});

describe('рассылка', () => {
  it('отправляет разовое напоминание один раз', async () => {
    await onMessage(message('через 10 минут чай'));
    resetApi();

    vi.setSystemTime(NOW + 9 * 60_000);
    await tick({}, {});
    expect(sent()).toHaveLength(0);

    vi.setSystemTime(NOW + 10 * 60_000);
    expect(await tick({}, {})).toEqual({ sent: 1, failed: 0 });
    expect(lastText()).toBe('🔔 чай');
    expect(await tick({}, {})).toEqual({ sent: 0, failed: 0 });
    expect((await rows())[0].active).toBe(0);
  });

  it('повторяющееся переносится на следующий раз', async () => {
    await onMessage(message('каждый день в 12:00 обед'));
    resetApi();
    vi.setSystemTime(Date.UTC(2026, 9, 13, 9, 3)); // 12:03 МСК, «будильник» опоздал
    await tick({}, {});
    expect(lastText()).toContain('обед');
    expect(lastText()).toContain('каждый день');
    const [r] = await rows();
    expect(r.next_at).toBe(Date.UTC(2026, 9, 14, 9, 0));
  });

  it('пропущенные срабатывания не присылаются пачкой', async () => {
    await onMessage(message('каждый час проверить почту'));
    resetApi();
    vi.setSystemTime(NOW + 5 * 3600_000 + 60_000); // будильника не было 5 часов
    await tick({}, {});
    expect(sent()).toHaveLength(1);
    expect((await rows())[0].next_at).toBe(NOW + 6 * 3600_000);
  });

  it('параллельные запуски не дублируют отправку', async () => {
    await onMessage(message('через 5 минут тест'));
    resetApi();
    vi.setSystemTime(NOW + 5 * 60_000);
    await Promise.all([tick({}, {}), tick({}, {}), onMessage(message('/help'))]);
    expect(sent().filter((c) => c.params.text === '🔔 тест')).toHaveLength(1);
  });

  it('при временной ошибке напоминание остаётся на повтор', async () => {
    await onMessage(message('через 5 минут тест'));
    vi.setSystemTime(NOW + 5 * 60_000);
    failures.set('sendMessage', 429);
    expect(await tick({}, {})).toEqual({ sent: 0, failed: 1 });
    expect((await rows())[0].active).toBe(1);
    expect(await tick({}, {})).toEqual({ sent: 1, failed: 0 });
  });

  it('если бот заблокирован — отключает напоминания чата', async () => {
    await onMessage(message('каждый день в 12:00 обед'));
    vi.setSystemTime(Date.UTC(2026, 9, 13, 9, 0));
    failures.set('sendMessage', 403);
    await tick({}, {});
    expect((await rows())[0].active).toBe(0);
  });

  it('любое входящее сообщение тоже запускает рассылку', async () => {
    await onMessage(message('через 5 минут тест'));
    resetApi();
    vi.setSystemTime(NOW + 6 * 60_000);
    await onMessage(message('/help'));
    expect(sent().map((c) => c.params.text)).toContain('🔔 тест');
  });

  it('«Отложить» создаёт новое разовое напоминание', async () => {
    await onMessage(message('через 5 минут тест'));
    vi.setSystemTime(NOW + 5 * 60_000);
    await tick({}, {});
    const [r] = await rows();
    await onCallback({ id: 'q', data: `snz:${r.id}:60`, message: { message_id: 9, chat: { id: CHAT }, text: '🔔 тест' } });
    const all = await rows();
    expect(all).toHaveLength(2);
    expect(all[1]).toMatchObject({ text: 'тест', active: 1, next_at: NOW + 65 * 60_000 });
  });
});

describe('эндпоинты мини-приложения', () => {
  it('создание текстом, список, удаление', async () => {
    const { reminder } = await createReminder({ text: 'по будням в 8:30 таблетка' }, ctx);
    expect(reminder).toMatchObject({ text: 'таблетка', repeat_text: 'по будням', next_text: 'ср, 14 октября 2026, 08:30' });

    const list = await listReminders({}, ctx);
    expect(list.tz).toBe('Europe/Moscow');
    expect(list.reminders).toHaveLength(1);

    await deleteReminder({ id: reminder.id }, ctx);
    expect((await listReminders({}, ctx)).reminders).toHaveLength(0);
  });

  it('создание из формы с днями недели', async () => {
    const at = Date.UTC(2026, 9, 13, 17, 0); // вт 20:00 МСК
    const { reminder } = await createReminder({ text: 'спорт', at, repeat: { unit: 'week', every: 1, weekdays: [1, 4] } }, ctx);
    expect(reminder.next_text).toBe('чт, 15 октября 2026, 20:00');
    expect(reminder.repeat_text).toBe('по дням: пн, чт');
  });

  it('ошибки возвращаются как EndpointError', async () => {
    await expect(createReminder({ text: 'просто текст' }, ctx)).rejects.toMatchObject({ parameters: { code: 'PARSE' } });
    await expect(createReminder({ text: 'x', at: NOW - 60_000 }, ctx)).rejects.toMatchObject({ parameters: { code: 'PAST' } });
    await expect(deleteReminder({ id: 123 }, ctx)).rejects.toMatchObject({ parameters: { code: 'NOT_FOUND' } });
    await expect(listReminders({}, {})).rejects.toMatchObject({ parameters: { code: 'NO_USER' } });
  });

  it('нельзя удалить чужое напоминание', async () => {
    const { reminder } = await createReminder({ text: 'завтра в 10 моё' }, ctx);
    const other = { initData: { user: { id: 2002 } } };
    await expect(deleteReminder({ id: reminder.id }, other)).rejects.toMatchObject({ parameters: { code: 'NOT_FOUND' } });
  });

  it('смена часового пояса', async () => {
    expect(await setTimezone({ tz: 'Asia/Yekaterinburg' }, ctx)).toEqual({ tz: 'Asia/Yekaterinburg' });
    expect((await listReminders({}, ctx)).tz).toBe('Asia/Yekaterinburg');
    await expect(setTimezone({ tz: 'Mars/Base' }, ctx)).rejects.toMatchObject({ parameters: { code: 'BAD_TZ' } });
  });
});

describe('служебные модули', () => {
  it('tick и setup нельзя вызвать из мини-приложения', async () => {
    await expect(tick({}, ctx)).rejects.toMatchObject({ parameters: { code: 'INTERNAL_ONLY' } });
    await expect(setup({}, ctx)).rejects.toMatchObject({ parameters: { code: 'INTERNAL_ONLY' } });
  });

  it('setup выставляет команды', async () => {
    const res = await setup({}, {});
    expect(calls.map((c) => c.method)).toContain('setMyCommands');
    expect(res).toMatchObject({ environment: 'local', version: 'dev' });
  });

  it('/version показывает окружение и версию', async () => {
    await onMessage(message('/version'));
    expect(lastText()).toBe('<code>local dev</code>');
  });
});
