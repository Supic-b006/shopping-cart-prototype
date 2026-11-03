import { test, expect } from "./fixtures";
import { login, add, cart, checkout, call, read } from "./helpers";
test("AC-14: API acceptance - customer cannot update product", async ({
  page,
  request,
}) => {
  await login(page);
  const before = await read(page, request, "/products");
  const r = await call(page, request, "/admin/products/P1", "PATCH", {
    price: 500,
  });
  expect(r.status()).toBe(403);
  expect((await r.json()).error.code).toBe("AUTH_FORBIDDEN");
  expect(await read(page, request, "/products")).toEqual(before);
  expect(before.find((p: any) => p.productId === "P1").price).toBe(450);
});
test("AC-15: other customer order is not visible", async ({
  page,
  browser,
  request,
}) => {
  await login(page, "cus_normal");
  expect((await add(page, "P1", 1)).status()).toBe(200);

  await cart(page);

  const checkoutResponse = await checkout(
    page,
    "inCity",
    "standard",
    {
      expectSuccess: true,
      expectedStatus: 201,
    },
  );

  const orderId =
    (await checkoutResponse.json()).data.order.orderId;

  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:5173",
    recordVideo: {
      dir: "test-results/actor-videos/",
    },
  });

  try {
    const otherPage = await context.newPage();
    await login(otherPage, "cus_prime");

    const apiResponse = await call(
      otherPage,
      request,
      `/orders/${orderId}`,
    );

    expect(apiResponse.status()).toBe(404);
    expect((await apiResponse.json()).error.code).toBe(
      "ORDER_NOT_FOUND",
    );

    const responsePromise = otherPage.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          `/api/orders/${orderId}` &&
        response.request().method() === "GET",
    );

    await otherPage.goto(`/orders/${orderId}`);

    const uiResponse = await responsePromise;

    expect(uiResponse.status()).toBe(404);
    expect((await uiResponse.json()).error.code).toBe(
      "ORDER_NOT_FOUND",
    );

    await expect(
      otherPage.getByTestId("app-message"),
    ).toHaveAttribute("data-code", "ORDER_NOT_FOUND");

    await expect(
      otherPage.getByTestId("order-detail-id"),
    ).toHaveCount(0);
  } finally {
    await context.close();
  }
});
test("AC-16: reports all invalid product fields without mutation", async ({
  page,
  request,
}) => {
  await login(page, "admin01");
  const before = await read(page, request, "/products");
  const row = page.getByTestId("admin-product-row-P1");
  await row.getByTestId("admin-product-price-input").fill("0");
  await row.getByTestId("admin-product-stock-input").fill("10000");
  const wait = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/admin/products/P1") &&
      r.request().method() === "PATCH",
  );
  await row.getByTestId("admin-product-save").click();
  const r = await wait;
  expect(r.status()).toBe(400);
  const e = (await r.json()).error;
  expect(e.code).toBe("VALIDATION_ERROR");
  expect(e.details.fields).toEqual(["price", "stock"]);
  expect(await read(page, request, "/products")).toEqual(before);
  await expect(row.getByTestId("admin-product-price")).toHaveAttribute(
    "data-value",
    "450",
  );
  await expect(row.getByTestId("admin-product-stock")).toHaveAttribute(
    "data-value",
    "20",
  );
});
test("AC-17: API acceptance - add forbidden during checkout", async ({
  page,
  browser,
  request,
}) => {
  await login(page);
  await add(page, "P1", 1);
  await cart(page);
  await checkout(page);
  const before = await read(page, request, "/cart");
  const adminTokenResponse = await request.post(
    "http://127.0.0.1:4000/api/auth/login",
    { data: { username: "admin01", password: process.env.SEED_PASSWORD } },
  );
  expect(adminTokenResponse.status()).toBe(200);
  const token = (await adminTokenResponse.json()).data.token;
  const products = async () => {
    const r = await request.get("http://127.0.0.1:4000/api/products", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(r.status()).toBe(200);
    return (await r.json()).data;
  };
  const stockBefore = await products();
  const ordersBefore = await read(page, request, "/orders");
  const r = await call(page, request, "/cart/items", "POST", {
    productId: "P1",
    quantity: 1,
  });
  expect(r.status()).toBe(409);
  expect((await r.json()).error.code).toBe("OPERATION_NOT_ALLOWED");
  expect(await read(page, request, "/cart")).toEqual(before);
  expect(await products()).toEqual(stockBefore);
  expect(await read(page, request, "/orders")).toEqual(ordersBefore);
});
