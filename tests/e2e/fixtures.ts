import { test as base, expect } from "@playwright/test";
export const API = "http://127.0.0.1:4000/api";
export const test = base.extend<{ resetData: void }>({
  resetData: [
    async ({ request }, use) => {
      const r = await request.post(`${API}/testing/reset`, {
        headers: { "X-Test-Reset-Key": process.env.TEST_RESET_KEY! },
      });
      expect(r.status()).toBe(200);
      expect(await r.json()).toEqual({ data: { reset: true } });
      await use();
    },
    { auto: true },
  ],
});
export { expect };
