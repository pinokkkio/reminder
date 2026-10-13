// Минимальный клиент Telegram Bot API.

export interface TgUser {
  id: number;
  first_name: string;
  username?: string;
  language_code?: string;
}

export interface TgMessage {
  message_id: number;
  chat: { id: number; type: string };
  from?: TgUser;
  text?: string;
}

export interface TgCallbackQuery {
  id: string;
  from: TgUser;
  message?: TgMessage;
  data?: string;
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}

export interface InlineButton {
  text: string;
  callback_data?: string;
  web_app?: { url: string };
}

export type InlineKeyboard = InlineButton[][];

export class TelegramError extends Error {
  constructor(public status: number, public description: string) {
    super(`Telegram API ${status}: ${description}`);
  }
}

export class Telegram {
  constructor(private token: string) {}

  async call<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string; error_code?: number };
    if (!data.ok) throw new TelegramError(data.error_code ?? res.status, data.description ?? res.statusText);
    return data.result as T;
  }

  sendMessage(chatId: number, text: string, keyboard?: InlineKeyboard) {
    return this.call("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    });
  }

  editMessageText(chatId: number, messageId: number, text: string, keyboard?: InlineKeyboard) {
    return this.call("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: { inline_keyboard: keyboard ?? [] },
    });
  }

  answerCallbackQuery(id: string, text?: string) {
    return this.call("answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}) });
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
