import { Db, type Reminder } from "./db";
import type { Env } from "./env";
import { parseReminder } from "./parser";
import { describeRepeat } from "./repeat";
import { type InlineKeyboard, type TgCallbackQuery, type TgMessage, type TgUpdate, Telegram, TelegramError, escapeHtml } from "./telegram";
import { formatDateTime, normalizeTimeZone } from "./time";

export const HELP = `Я напоминаю о делах — разово или по расписанию.

<b>Просто напишите, например:</b>
• завтра в 10:30 позвонить маме
• через 2 часа выключить духовку
• 25 декабря в 18:00 купить подарки
• в пятницу в 19 кино
• каждый день в 9:00 зарядка
• по будням в 8:30 выпить таблетку
• каждый понедельник и четверг в 20:00 спортзал
• каждые 3 часа пить воду
• каждый месяц 15 числа в 12:00 оплатить интернет
• каждый год 1 марта поздравить сестру

В группах начинайте сообщение со слова «напомни».

<b>Команды:</b>
/list — мои напоминания
/tz — часовой пояс (например, <code>/tz Europe/Moscow</code> или <code>/tz +5</code>)
/app — открыть мини-приложение
/help — эта справка`;

export class Bot {
  readonly tg: Telegram;
  readonly db: Db;

  constructor(private env: Env, private appUrl: string) {
    this.tg = new Telegram(env.BOT_TOKEN);
    this.db = new Db(env.DB, env.DEFAULT_TZ || "Europe/Moscow");
  }

  async handle(update: TgUpdate): Promise<void> {
    if (update.message?.text) await this.onMessage(update.message);
    else if (update.callback_query) await this.onCallback(update.callback_query);
  }

  private appButton(chatType: string): InlineKeyboard | undefined {
    // Кнопки web_app в inline-клавиатуре работают только в личных чатах
    return chatType === "private" ? [[{ text: "📱 Открыть приложение", web_app: { url: this.appUrl } }]] : undefined;
  }

  private async onMessage(msg: TgMessage): Promise<void> {
    const chatId = msg.chat.id;
    const text = msg.text!.trim();
    const isPrivate = msg.chat.type === "private";

    const cmd = text.match(/^\/([a-z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i);
    if (cmd) {
      const [, name, arg = ""] = cmd;
      switch (name.toLowerCase()) {
        case "start":
          await this.db.ensureUser(chatId);
          return void (await this.tg.sendMessage(chatId, `👋 Привет!\n\n${HELP}`, this.appButton(msg.chat.type)));
        case "help":
          return void (await this.tg.sendMessage(chatId, HELP));
        case "app":
          if (!isPrivate) return void (await this.tg.sendMessage(chatId, "Мини-приложение доступно в личном чате с ботом."));
          return void (await this.tg.sendMessage(chatId, "Управляйте напоминаниями в приложении:", this.appButton(msg.chat.type)));
        case "list":
          return this.sendList(chatId);
        case "tz":
          return this.onTz(chatId, arg.trim());
        case "del":
        case "delete": {
          const id = Number(arg.replace(/^#/, ""));
          const ok = id > 0 && (await this.db.remove(chatId, id));
          return void (await this.tg.sendMessage(chatId, ok ? `🗑 Напоминание #${id} удалено.` : "Не нашёл такое напоминание. Посмотрите /list."));
        }
        default:
          if (!isPrivate) return;
          return void (await this.tg.sendMessage(chatId, "Не знаю такой команды. /help — справка."));
      }
    }

    // В группах реагируем только на «напомни …», чтобы не разбирать всю переписку
    if (!isPrivate && !/^напомн/i.test(text)) return;
    return this.onReminderText(chatId, text);
  }

  private async onReminderText(chatId: number, text: string): Promise<void> {
    const tz = await this.db.getTz(chatId);
    const parsed = parseReminder(text, Date.now(), tz);
    if (!parsed.ok) {
      return void (await this.tg.sendMessage(chatId, `🤔 ${escapeHtml(parsed.error)}\n\n/help — примеры.`));
    }
    if (!(await this.db.canAdd(chatId))) {
      return void (await this.tg.sendMessage(chatId, "Слишком много активных напоминаний. Удалите ненужные через /list."));
    }
    await this.db.ensureUser(chatId);
    const id = await this.db.add(chatId, parsed.text, parsed.at, parsed.repeat, tz);
    await this.tg.sendMessage(
      chatId,
      `✅ Напомню <b>${escapeHtml(formatDateTime(parsed.at, tz))}</b>` +
        (parsed.repeat ? `\n🔁 ${describeRepeat(parsed.repeat)}` : "") +
        `\n📝 ${escapeHtml(parsed.text)}`,
      [[{ text: "↩️ Отменить", callback_data: `undo:${id}` }]],
    );
  }

  private async onTz(chatId: number, arg: string): Promise<void> {
    if (!arg) {
      const tz = await this.db.getTz(chatId);
      return void (await this.tg.sendMessage(
        chatId,
        `Ваш часовой пояс: <b>${escapeHtml(tz)}</b>\nСейчас там: ${escapeHtml(formatDateTime(Date.now(), tz))}\n\n` +
          "Изменить: <code>/tz Europe/Moscow</code>, <code>/tz Asia/Yekaterinburg</code> или <code>/tz +3</code>",
      ));
    }
    const tz = normalizeTimeZone(arg);
    if (!tz) return void (await this.tg.sendMessage(chatId, "Не знаю такого часового пояса. Пример: <code>/tz Europe/Moscow</code> или <code>/tz +3</code>"));
    await this.db.setTz(chatId, tz);
    await this.tg.sendMessage(
      chatId,
      `🌍 Часовой пояс: <b>${escapeHtml(tz)}</b> (сейчас ${escapeHtml(formatDateTime(Date.now(), tz))}).\n` +
        "Новые напоминания будут считаться по нему.",
    );
  }

  private listView(items: Reminder[]): { text: string; keyboard: InlineKeyboard } {
    if (!items.length) return { text: "У вас нет активных напоминаний.", keyboard: [] };
    const lines = items.slice(0, 50).map((r) => {
      const rep = r.repeat ? ` · 🔁 ${describeRepeat(r.repeat)}` : "";
      return `<b>#${r.id}</b> ${escapeHtml(formatDateTime(r.next_at, r.tz))}${rep}\n${escapeHtml(r.text)}`;
    });
    const keyboard: InlineKeyboard = [];
    const ids = items.slice(0, 50).map((r) => r.id);
    for (let i = 0; i < ids.length; i += 4) {
      keyboard.push(ids.slice(i, i + 4).map((id) => ({ text: `🗑 #${id}`, callback_data: `del:${id}` })));
    }
    const more = items.length > 50 ? `\n\n…и ещё ${items.length - 50}` : "";
    return { text: `📋 <b>Ваши напоминания</b>\n\n${lines.join("\n\n")}${more}`, keyboard };
  }

  private async sendList(chatId: number): Promise<void> {
    const view = this.listView(await this.db.list(chatId));
    await this.tg.sendMessage(chatId, view.text, view.keyboard);
  }

  private async onCallback(q: TgCallbackQuery): Promise<void> {
    const msg = q.message;
    const [action, idStr, arg] = (q.data ?? "").split(":");
    const id = Number(idStr);
    if (!msg || !id) return void (await this.tg.answerCallbackQuery(q.id));
    const chatId = msg.chat.id;

    switch (action) {
      case "del": {
        const ok = await this.db.remove(chatId, id);
        await this.tg.answerCallbackQuery(q.id, ok ? "Удалено" : "Уже удалено");
        const view = this.listView(await this.db.list(chatId));
        await this.tg.editMessageText(chatId, msg.message_id, view.text, view.keyboard).catch(ignoreNotModified);
        return;
      }
      case "undo":
      case "off": {
        const ok = await this.db.remove(chatId, id);
        await this.tg.answerCallbackQuery(q.id, ok ? "Удалено" : "Уже удалено");
        if (ok) {
          const note = action === "undo" ? "↩️ Напоминание отменено." : "🔕 Повторы отключены, напоминание удалено.";
          await this.tg.editMessageText(chatId, msg.message_id, `${escapeHtml(msg.text ?? "")}\n\n${note}`).catch(ignoreNotModified);
        }
        return;
      }
      case "snz": {
        const minutes = Math.min(Math.max(Number(arg) || 10, 1), 7 * 24 * 60);
        const src = await this.db.get(id);
        if (!src || src.chat_id !== chatId) return void (await this.tg.answerCallbackQuery(q.id, "Напоминание не найдено"));
        if (!(await this.db.canAdd(chatId))) return void (await this.tg.answerCallbackQuery(q.id, "Слишком много напоминаний"));
        const at = Math.round((Date.now() + minutes * 60_000) / 60_000) * 60_000;
        await this.db.add(chatId, src.text, at, null, src.tz);
        const when = formatDateTime(at, src.tz);
        await this.tg.answerCallbackQuery(q.id, `Напомню ${when}`);
        await this.tg
          .editMessageText(chatId, msg.message_id, `${escapeHtml(msg.text ?? "")}\n\n⏰ Отложено до ${escapeHtml(when)}`)
          .catch(ignoreNotModified);
        return;
      }
      default:
        await this.tg.answerCallbackQuery(q.id);
    }
  }

  // ---------- Рассылка по расписанию ----------

  async deliver(r: Reminder): Promise<void> {
    const keyboard: InlineKeyboard = [
      [
        { text: "⏰ 10 мин", callback_data: `snz:${r.id}:10` },
        { text: "1 час", callback_data: `snz:${r.id}:60` },
        { text: "Завтра", callback_data: `snz:${r.id}:1440` },
      ],
    ];
    if (r.repeat) keyboard.push([{ text: "🔕 Больше не напоминать", callback_data: `off:${r.id}` }]);
    const footer = r.repeat ? `\n\n<i>🔁 ${describeRepeat(r.repeat)}</i>` : "";
    await this.tg.sendMessage(r.chat_id, `🔔 ${escapeHtml(r.text)}${footer}`, keyboard);
  }
}

function ignoreNotModified(e: unknown): void {
  if (e instanceof TelegramError && /not modified/i.test(e.description)) return;
  throw e;
}
