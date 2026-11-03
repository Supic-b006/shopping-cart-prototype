import { test, expect } from "./fixtures";
import { login, add, read, error } from "./helpers";
for (const c of [
  { ac: 1, id: "P1", initial: 0, extra: 0, code: "QTY_OUT_OF_RANGE" },
  { ac: 2, id: "P1", initial: 8, extra: 3, code: "QTY_OUT_OF_RANGE" },
  { ac: 3, id: "P2", initial: 2, extra: 2, code: "INSUFFICIENT_STOCK" },
]) {
  test(`AC-${c.ac}: invalid add preserves cart`, async ({ page, request }) => {
    await login(page);
    if (c.initial)
      expect((await add(page, c.id, c.initial)).status()).toBe(200);
    const before = await read(page, request, "/cart");
    const response = await add(page, c.id, c.extra);
    expect(response.status()).toBe(c.ac === 3 ? 409 : 400);
    expect((await response.json()).error.code).toBe(c.code);
    await error(page, c.code);
    expect(await read(page, request, "/cart")).toEqual(before);
    expect(before.lines.map((l: any) => l.quantity)).toEqual(
      c.initial ? [c.initial] : [],
    );
  });
}
