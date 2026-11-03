import { test, expect } from "./fixtures";
import { login, add, cart, checkout } from "./helpers";

test("DC-2.1–2.3: login form supports accessible locators", async ({
  page,
}) => {
  await page.goto("/login");

  await expect(
    page.getByRole("textbox", { name: "ชื่อผู้ใช้" }),
  ).toBeVisible();

  await expect(
    page.getByLabel("รหัสผ่าน"),
  ).toBeVisible();

  await expect(
    page.getByRole("button", { name: "เข้าสู่ระบบ" }),
  ).toBeVisible();
});

test("DC-2.10: cart line exposes product availability", async ({
  page,
}) => {
  await login(page);
  await add(page, "P1", 1);
  await cart(page);

  const line = page.getByTestId("cart-line-P1");

  await expect(
    line.getByTestId("cart-line-availability"),
  ).toHaveAttribute("data-available", "true");
});

test("DC-2.11: checkout button uses disabled attribute", async ({
  page,
}) => {
  await login(page);
  await page.getByTestId("nav-cart").click();

  await expect(
    page.getByTestId("checkout-button"),
  ).toBeDisabled();

  await page.getByTestId("nav-products").click();
  await add(page, "P1", 1);
  await cart(page);

  await expect(
    page.getByTestId("checkout-button"),
  ).toBeEnabled();
});

test("DC-2.12: customer pages support direct URLs", async ({ page }) => {
  await login(page);

  await page.goto("/products");
  await expect(page.getByTestId("page-products")).toBeVisible();

  await page.goto("/cart");
  await expect(page.getByTestId("page-cart")).toBeVisible();

  await page.goto("/orders");
  await expect(page.getByTestId("page-orders")).toBeVisible();
});

test("DC-2.12: admin pages support direct URLs", async ({ page }) => {
  await login(page, "admin01");

  await page.goto("/admin/products");
  await expect(page.getByTestId("page-admin-products")).toBeVisible();

  await page.goto("/admin/coupons");
  await expect(page.getByTestId("page-admin-coupons")).toBeVisible();
});

test("DC-2.13: wrong URL displays page matching current stage", async ({
  page,
}) => {
  await login(page);
  await add(page, "P1", 1);
  await cart(page);
  await checkout(page);

  // ขณะนี้ Customer อยู่ stage checkout
  await page.goto("/products");

  await expect(
    page.getByTestId("page-checkout"),
  ).toBeVisible();
});