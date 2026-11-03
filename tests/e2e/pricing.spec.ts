import { test, expect } from "./fixtures";
import {
  login,
  add,
  cart,
  coupon,
  checkout,
  totals,
  read,
  error,
  actor,
  closeCoupon,
} from "./helpers";

for (const c of [
  {
    ac: 4,
    user: "cus_prime",
    lines: [
      ["P1", 1],
      ["P2", 1],
    ],
    coupon: true,
    zone: "inCity",
    speed: "standard",
    values: [1650, 165, 0, 1485],
  },
  {
    ac: 5,
    user: "cus_prime",
    lines: [
      ["P1", 1],
      ["P2", 1],
    ],
    coupon: false,
    zone: "inCity",
    speed: "standard",
    values: [1650, 82, 0, 1568],
  },
  {
    ac: 6,
    user: "cus_prime",
    lines: [["P1", 2]],
    coupon: true,
    zone: "upcountry",
    speed: "express",
    values: [900, 45, 25, 880],
  },
  {
    ac: 7,
    user: "cus_normal",
    lines: [["P2", 1]],
    coupon: true,
    zone: "inCity",
    speed: "standard",
    values: [1200, 0, 30, 1230],
  },
  {
    ac: 8,
    user: "cus_normal",
    lines: [["P3", 1]],
    coupon: false,
    zone: "remote",
    speed: "express",
    values: [15000, 0, 270, 15270],
  },
])
  test(`AC-${c.ac}: pricing and coupon`, async ({ page, browser, request }) => {
    await login(page, c.user);
    for (const [id, q] of c.lines)
      expect((await add(page, String(id), Number(q))).status()).toBe(200);
    await cart(page);
    if (c.coupon) await coupon(page);
    if (c.ac === 7) await actor(browser, "admin01", closeCoupon);
    const response = await checkout(page, c.zone, c.speed);
    expect(response.status()).toBe(201);
    await totals(page, c.values[0], c.values[1], c.values[2], c.values[3]);
    const result = await response.json();
    expect(result.data.order.discountSource).toBe(
      c.ac === 4 ? "coupon" : c.user === "cus_prime" ? "member" : "none",
    );
    if (c.ac === 6 || c.ac === 7) {
      await expect(page.getByTestId("app-message")).toHaveAttribute(
        "data-kind",
        "notice",
      );
      await expect(page.getByTestId("app-message")).toHaveAttribute(
        "data-code",
        "COUPON_NOT_APPLICABLE",
      );
      await expect(page.getByTestId("app-message")).toContainText(
        "คูปองไม่สามารถใช้กับคำสั่งซื้อนี้",
      );
      expect((await read(page, request, "/cart")).couponCode).toBeNull();
    }
  });
test("AC-9: overweight preserves cart and stage", async ({
  page,
  request,
}) => {
  await login(page);

  const addResponse = await add(page, "P3", 3);
  expect(addResponse.status()).toBe(200);

  await cart(page);

  const before = await read(page, request, "/cart");

  const response = await checkout(page, "inCity", "standard", {
    expectSuccess: false,
    expectedStatus: 409,
  });

  const body = await response.json();

  expect(body.error.code).toBe("WEIGHT_LIMIT_EXCEEDED");

  await error(page, "WEIGHT_LIMIT_EXCEEDED");
  await expect(page.getByTestId("page-cart")).toBeVisible();

  const after = await read(page, request, "/cart");

  expect(after).toEqual(before);
});