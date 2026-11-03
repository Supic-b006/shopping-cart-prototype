import { test, expect } from "./fixtures";
import {
  login,
  add,
  cart,
  checkout,
  read,
  call,
  error,
  actor,
  price,
} from "./helpers";

// รวมเวลา reset, login, UI และ API ของแต่ละ test
// เพิ่มเพื่อวินิจฉัยกรณีที่เดิมชนเพดาน 60 วินาที
test.describe.configure({ timeout: 180_000 });

type CartLine = {
  productId: string;
  quantity: number;
  price: number;
};

function quantities(lines: CartLine[]) {
  return lines
    .map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
    }))
    .sort((a, b) => a.productId.localeCompare(b.productId));
}

test("AC-10: closed product blocks checkout", async ({
  page,
  browser,
  request,
}) => {
  await login(page);
  expect((await add(page, "P1", 1)).status()).toBe(200);
  await cart(page);

  const before = await read(page, request, "/cart");

  await actor(browser, "admin01", async (adminPage) => {
    const row = adminPage.getByTestId("admin-product-row-P1");

    await expect(row).toBeVisible();

    const responsePromise = adminPage.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          "/api/admin/products/P1/status" &&
        response.request().method() === "PATCH",
    );

    await row.getByTestId("admin-product-toggle-status").click();

    const response = await responsePromise;
    expect(response.status()).toBe(200);

    await expect(row.getByTestId("admin-product-status")).toHaveAttribute(
      "data-status",
      "false",
    );
  });

  const response = await checkout(page, "inCity", "standard", {
    expectSuccess: false,
    expectedStatus: 409,
  });

  const body = await response.json();
  expect(body.error.code).toBe("ITEMS_UNAVAILABLE");
  expect(body.error.details.productIds).toEqual(["P1"]);

  await error(page, "ITEMS_UNAVAILABLE");
  await expect(page.getByTestId("page-cart")).toBeVisible();

  const after = await read(page, request, "/cart");

  expect(after.stage).toBe(before.stage);
  expect(quantities(after.lines)).toEqual(quantities(before.lines));
  expect(quantities(after.lines)).toEqual([
    { productId: "P1", quantity: 1 },
  ]);
});

test("AC-11a: checkout reserves all P2 stock", async ({
  page,
  browser,
  request,
}) => {
  await login(page);
  expect((await add(page, "P2", 3)).status()).toBe(200);
  await cart(page);

  const response = await checkout(page, "inCity", "standard", {
    expectSuccess: true,
    expectedStatus: 201,
  });

  const order = (await response.json()).data.order;
  expect(order.status).toBe("pending");

  const currentCart = await read(page, request, "/cart");
  expect(currentCart.stage).toBe("checkout");

  await actor(browser, "admin01", async (adminPage) => {
    await expect(
      adminPage
        .getByTestId("admin-product-row-P2")
        .getByTestId("admin-product-stock"),
    ).toHaveAttribute("data-value", "0");
  });
});

test("AC-11b: another customer cannot checkout reserved stock", async ({
  page,
  browser,
  request,
}) => {
  // Prime เพิ่มสินค้าก่อนที่ลูกค้าอีกคนจะจอง stock ทั้งหมด
  await login(page, "cus_prime");
  expect((await add(page, "P2", 1)).status()).toBe(200);
  await cart(page);

  const before = await read(page, request, "/cart");

  await actor(browser, "cus_normal", async (customerPage) => {
    expect((await add(customerPage, "P2", 3)).status()).toBe(200);
    await cart(customerPage);

    // ลูกค้าคนนี้ต้อง checkout สำเร็จเพื่อจอง P2 ทั้ง 3 ชิ้น
    const response = await checkout(
      customerPage,
      "inCity",
      "standard",
      {
        expectSuccess: true,
        expectedStatus: 201,
      },
    );

    expect((await response.json()).data.order.status).toBe("pending");
  });

  // Prime checkout ไม่ได้ เพราะ stock ถูกจองหมดแล้ว
  const response = await checkout(page, "inCity", "standard", {
    expectSuccess: false,
    expectedStatus: 409,
  });

  const body = await response.json();
  expect(body.error.code).toBe("ITEMS_UNAVAILABLE");
  expect(body.error.details.productIds).toEqual(["P2"]);

  await error(page, "ITEMS_UNAVAILABLE");
  await expect(page.getByTestId("page-cart")).toBeVisible();

  const after = await read(page, request, "/cart");

  expect(after.stage).toBe("cart");
  expect(quantities(after.lines)).toEqual(quantities(before.lines));
});

test("AC-11c: API acceptance - unavailable product cannot be added", async ({
  page,
  browser,
  request,
}) => {
  await login(page, "cus_prime");

  await actor(browser, "cus_normal", async (customerPage) => {
    expect((await add(customerPage, "P2", 3)).status()).toBe(200);
    await cart(customerPage);

    const response = await checkout(
      customerPage,
      "inCity",
      "standard",
      {
        expectSuccess: true,
        expectedStatus: 201,
      },
    );

    expect((await response.json()).data.order.status).toBe("pending");
  });

  const before = await read(page, request, "/cart");
  expect(before.lines).toEqual([]);

  // UI ซ่อนสินค้าที่ stock เป็น 0 จึงตรวจการป้องกันผ่าน API
  const response = await call(page, request, "/cart/items", "POST", {
    productId: "P2",
    quantity: 1,
  });

  expect(response.status()).toBe(409);
  expect((await response.json()).error.code).toBe("PRODUCT_UNAVAILABLE");

  const after = await read(page, request, "/cart");
  expect(after).toEqual(before);
});

test("AC-12: cancellation restores reservation and keeps cart", async ({
  page,
  browser,
  request,
}) => {
  await login(page);
  expect((await add(page, "P2", 3)).status()).toBe(200);
  await cart(page);

  const response = await checkout(page, "inCity", "standard", {
    expectSuccess: true,
    expectedStatus: 201,
  });

  const order = (await response.json()).data.order;
  const orderId = order.orderId;
  expect(order.status).toBe("pending");

  // ตรวจ stock ก่อนยกเลิก และหลังยกเลิกด้วย Admin คนเดียวกัน
  await actor(browser, "admin01", async (adminPage) => {
    const stock = adminPage
      .getByTestId("admin-product-row-P2")
      .getByTestId("admin-product-stock");

    await expect(stock).toHaveAttribute("data-value", "0");

    const cancelPromise = page.waitForResponse(
      (result) =>
        new URL(result.url()).pathname === "/api/checkout/cancel" &&
        result.request().method() === "POST",
    );

    await page.getByTestId("cancel-checkout-button").click();

    const cancelResponse = await cancelPromise;
    expect(cancelResponse.status()).toBe(200);

    await expect(page.getByTestId("page-cart")).toBeVisible();

    const cancelledOrder = await read(
      page,
      request,
      `/orders/${orderId}`,
    );
    expect(cancelledOrder.status).toBe("cancelled");

    const currentCart = await read(page, request, "/cart");
    expect(currentCart.stage).toBe("cart");
    expect(quantities(currentCart.lines)).toEqual([
      { productId: "P2", quantity: 3 },
    ]);

    // โหลดข้อมูลใหม่ เพราะ Admin เป็นอีก browser context
    await adminPage.reload();
    await expect(
      adminPage.getByTestId("page-admin-products"),
    ).toBeVisible();

    await expect(stock).toHaveAttribute("data-value", "3");
  });
});

test("AC-13: price snapshot stays 450 while cart price becomes 500", async ({
  page,
  browser,
  request,
}) => {
  await login(page);
  expect((await add(page, "P1", 1)).status()).toBe(200);
  await cart(page);

  const before = await read(page, request, "/cart");
  const originalLine = before.lines.find(
    (line: CartLine) => line.productId === "P1",
  );
  expect(originalLine?.price).toBe(450);

  const response = await checkout(page, "inCity", "standard", {
    expectSuccess: true,
    expectedStatus: 201,
  });

  const order = (await response.json()).data.order;
  const orderId = order.orderId;
  expect(order.status).toBe("pending");

  await actor(browser, "admin01", async (adminPage) => {
    await price(adminPage, 500);
  });

  // เปิดออร์เดอร์ pending เดิม โดยไม่ชำระเงิน
  await page.goto(`/orders/${orderId}`);

  await expect(page.getByTestId("page-order-detail")).toBeVisible();

  await expect(
    page
      .getByTestId("order-line-P1")
      .getByTestId("order-line-unit-price"),
  ).toHaveAttribute("data-value", "450");

  const currentOrder = await read(page, request, `/orders/${orderId}`);
  expect(currentOrder.status).toBe("pending");

  const currentCart = await read(page, request, "/cart");
  expect(currentCart.stage).toBe("checkout");

  const currentLine = currentCart.lines.find(
    (line: CartLine) => line.productId === "P1",
  );
  expect(currentLine).toBeDefined();
  expect(currentLine?.price).toBe(500);
});