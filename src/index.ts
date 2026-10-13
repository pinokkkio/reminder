import { handleApi } from "./api";
import { Bot } from "./bot";
import type { Env } from "./env";
import { MINI_APP_HTML } from "./miniapp";
import { runDue } from "./scheduler";
import type { TgUpdate } from "./telegram";

export type { Env };

function appUrl(origin: string): string {
  return `${origin}/app`;
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const bot = new Bot(env, appUrl(url.origin));

    // Вебхук Telegram
    if (url.pathname === "/webhook" && req.method === "POST") {
      if (req.headers.get("x-telegram-bot-api-secret-token") !== env.WEBHOOK_SECRET) {
        return new Response("forbidden", { status: 403 });
      }
      const update = (await req.json()) as TgUpdate;
      // Отвечаем Telegram сразу; при ошибке не возвращаем 500, иначе Telegram будет повторять апдейт
      ctx.waitUntil(bot.handle(update).catch((e) => console.error("update failed", e)));
      return new Response("ok");
    }

    // Одноразовая настройка: вебхук, команды, кнопка меню с мини-приложением
    if (url.pathname === "/setup") {
      if (url.searchParams.get("key") !== env.WEBHOOK_SECRET) return new Response("forbidden", { status: 403 });
      const results = {
        webhook: await bot.tg.call("setWebhook", {
          url: `${url.origin}/webhook`,
          secret_token: env.WEBHOOK_SECRET,
          allowed_updates: ["message", "callback_query"],
          drop_pending_updates: true,
        }),
        commands: await bot.tg.call("setMyCommands", {
          commands: [
            { command: "list", description: "Мои напоминания" },
            { command: "tz", description: "Часовой пояс" },
            { command: "app", description: "Открыть приложение" },
            { command: "help", description: "Справка и примеры" },
          ],
        }),
        menu: await bot.tg.call("setChatMenuButton", {
          menu_button: { type: "web_app", text: "Напоминания", web_app: { url: appUrl(url.origin) } },
        }),
      };
      return Response.json(results);
    }

    if (url.pathname === "/app" || url.pathname === "/app/") {
      return new Response(MINI_APP_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    if (url.pathname.startsWith("/api/")) return handleApi(req, url, env, bot);

    if (url.pathname === "/") return new Response("Telegram reminder bot is running.");
    return new Response("not found", { status: 404 });
  },

  async scheduled(_event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    // Origin для кнопки мини-приложения в рассылке не нужен
    const bot = new Bot(env, "");
    const { sent, failed } = await runDue(bot);
    if (sent || failed) console.log(`reminders sent=${sent} failed=${failed}`);
  },
} satisfies ExportedHandler<Env>;
