import { describe, expect, it } from "vitest";
import { signInitData, validateInitData } from "../src/auth";

const TOKEN = "123456:TEST";

describe("validateInitData", () => {
  const now = Date.now();
  const fields = { auth_date: String(Math.floor(now / 1000)), query_id: "AAA", user: JSON.stringify({ id: 42, first_name: "Ann" }) };

  it("принимает корректную подпись", async () => {
    const data = await signInitData(fields, TOKEN);
    expect(await validateInitData(data, TOKEN, now)).toMatchObject({ id: 42 });
  });

  it("отклоняет подделку", async () => {
    const data = await signInitData(fields, TOKEN);
    expect(await validateInitData(data.replace("42", "43"), TOKEN, now)).toBeNull();
    expect(await validateInitData(data, "other:token", now)).toBeNull();
  });

  it("отклоняет устаревшие данные", async () => {
    const data = await signInitData(fields, TOKEN);
    expect(await validateInitData(data, TOKEN, now + 2 * 24 * 3600 * 1000)).toBeNull();
  });
});
