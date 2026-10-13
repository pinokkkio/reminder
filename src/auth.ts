// Проверка initData мини-приложения:
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app

const encoder = new TextEncoder();

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, encoder.encode(data));
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface WebAppUser {
  id: number;
  first_name?: string;
  username?: string;
}

/** Возвращает пользователя, если подпись верна и данные не старше maxAgeSec. */
export async function validateInitData(
  initData: string,
  botToken: string,
  now = Date.now(),
  maxAgeSec = 24 * 3600,
): Promise<WebAppUser | null> {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secret = await hmac(encoder.encode("WebAppData"), botToken);
  const expected = toHex(await hmac(secret, dataCheckString));
  if (!safeEqual(expected, hash)) return null;

  const authDate = Number(params.get("auth_date"));
  if (!authDate || now / 1000 - authDate > maxAgeSec) return null;

  try {
    const user = JSON.parse(params.get("user") ?? "null") as WebAppUser | null;
    return user && typeof user.id === "number" ? user : null;
  } catch {
    return null;
  }
}

/** Подпись initData — используется в тестах. */
export async function signInitData(fields: Record<string, string>, botToken: string): Promise<string> {
  const params = new URLSearchParams(fields);
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = await hmac(encoder.encode("WebAppData"), botToken);
  params.set("hash", toHex(await hmac(secret, dataCheckString)));
  return params.toString();
}
