import {
  expect,
  type APIRequestContext,
  type Browser,
  type Page,
} from "@playwright/test";
import { API } from "./fixtures";

export async function login(
  page: Page,
  username = "cus_normal",
): Promise<void> {
  await page.goto("/login");

  await page.getByTestId("login-username").fill(username);
  await page
    .getByTestId("login-password")
    .fill(process.env.SEED_PASSWORD ?? "");

  await page.getByTestId("login-submit").click();

  await expect(
    page.getByTestId(
      username === "admin01" ? "page-admin-products" : "page-products",
    ),
  ).toBeVisible();
}

export async function add(
  page: Page,
  productId: string,
  quantity: number,
) {
  const row = page.getByTestId(`product-row-${productId}`);

  await expect(row).toBeVisible();
  await row.getByTestId("product-add-qty").fill(String(quantity));

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/cart/items") &&
      response.request().method() === "POST",
  );

  await row.getByTestId("product-add-button").click();

  const response = await responsePromise;

  if (response.ok()) {
    await expect(row.getByTestId("product-add-button")).toBeEnabled();
  }

  return response;
}

export async function call(
  page: Page,
  request: APIRequestContext,
  path: string,
  method = "GET",
  data?: unknown,
) {
  const token = await page.evaluate(() =>
    sessionStorage.getItem("bean.token"),
  );

  return request.fetch(`${API}${path}`, {
    method,
    data,
    headers: {
      Authorization: `Bearer ${token ?? ""}`,
    },
  });
}

export async function read(
  page: Page,
  request: APIRequestContext,
  path: string,
) {
  const response = await call(page, request, path);

  expect(response.status()).toBe(200);

  return (await response.json()).data;
}

export async function cart(page: Page): Promise<void> {
  await page.getByTestId("nav-cart").click();
  await expect(page.getByTestId("page-cart")).toBeVisible();
}

export async function coupon(page: Page): Promise<void> {
  await page.getByTestId("coupon-input").fill("SAVE10");

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/cart/coupon") &&
      response.request().method() === "POST",
  );

  await page.getByTestId("coupon-apply").click();

  const response = await responsePromise;

  expect(response.ok()).toBeTruthy();

  await expect(page.getByTestId("cart-coupon-code")).toHaveText("SAVE10");
  await expect(page.getByTestId("coupon-apply")).toBeEnabled();
}

export async function checkout(
  page: Page,
  zone = "inCity",
  speed = "standard",
  options: {
    expectSuccess?: boolean;
    expectedStatus?: number;
  } = {},
) {
  const expectSuccess = options.expectSuccess ?? true;

  await page.getByTestId("zone-select").selectOption(zone);
  await page.getByTestId("speed-select").selectOption(speed);

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/checkout") &&
      response.request().method() === "POST",
  );

  await page.getByTestId("checkout-button").click();

  const response = await responsePromise;

  if (options.expectedStatus !== undefined) {
    expect(response.status()).toBe(options.expectedStatus);
  } else if (expectSuccess) {
    expect(response.ok()).toBeTruthy();
  } else {
    expect(response.ok()).toBeFalsy();
  }

  if (expectSuccess && response.ok()) {
    await expect(page.getByTestId("page-checkout")).toBeVisible();
    await expect(page.getByTestId("checkout-total")).toBeVisible();
  }

  return response;
}

export async function error(
  page: Page,
  code: string,
): Promise<void> {
  const message = page.getByTestId("app-message");

  await expect(message).toBeVisible();
  await expect(message).toHaveAttribute("data-code", code);
  await expect(message).toHaveAttribute("data-kind", "error");
}

export async function totals(
  page: Page,
  subtotal: number,
  discount: number,
  shipping: number,
  total: number,
): Promise<void> {
  const values = {
    subtotal,
    discount,
    shipping,
    total,
  };

  for (const [key, value] of Object.entries(values)) {
    await expect(page.getByTestId(`checkout-${key}`)).toHaveAttribute(
      "data-value",
      String(value),
    );
  }
}

export async function actor(
  browser: Browser,
  username: string,
  work: (page: Page) => Promise<void>,
): Promise<void> {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:5173",
    recordVideo: {
      dir: "test-results/actor-videos/",
    },
  });

  try {
    const page = await context.newPage();

    await login(page, username);
    await work(page);
  } finally {
    await context.close();
  }
}

export async function price(
  page: Page,
  value: number,
): Promise<void> {
  const row = page.getByTestId("admin-product-row-P1");

  await expect(row).toBeVisible();
  await row.getByTestId("admin-product-price-input").fill(String(value));

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/admin/products/P1") &&
      response.request().method() === "PATCH",
  );

  await row.getByTestId("admin-product-save").click();

  const response = await responsePromise;

  expect(response.ok()).toBeTruthy();

  await expect(
    page
      .getByTestId("admin-product-row-P1")
      .getByTestId("admin-product-price"),
  ).toHaveAttribute("data-value", String(value));
}

export async function closeCoupon(page: Page): Promise<void> {
  await page.getByTestId("nav-admin-coupons").click();

  await expect(page.getByTestId("page-admin-coupons")).toBeVisible();

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/admin/coupons/SAVE10/status") &&
      response.request().method() === "PATCH",
  );

  await page.getByTestId("admin-coupon-toggle-status").click();

  const response = await responsePromise;

  expect(response.ok()).toBeTruthy();

  await expect(page.getByTestId("admin-coupon-status")).toHaveAttribute(
    "data-status",
    "false",
  );
}