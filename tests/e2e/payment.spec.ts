import { test, expect } from "./fixtures";
import { login, add, cart, coupon, checkout, read } from "./helpers";
for (const ac of ["18a", "18b"])
  test(`AC-${ac}: payment and continuation`, async ({ page, request }) => {
    await login(page);
    await add(page, "P2", 1);
    await cart(page);
    await coupon(page);
    const id = (await (await checkout(page)).json()).data.order.orderId;
    await page.getByTestId("gateway-pay-success").click();
    await expect(page.getByTestId("page-success")).toBeVisible();
    expect((await read(page, request, `/orders/${id}`)).status).toBe("paid");
    const c = await read(page, request, "/cart");
    expect(c.stage).toBe("success");
    expect(c.lines).toEqual([]);
    expect(c.couponCode).toBeNull();
    await expect(page.getByTestId("success-order-id")).toHaveText(id);
    if (ac === "18b") {
      await page.getByTestId("continue-shopping-button").click();
      await expect(page.getByTestId("page-products")).toBeVisible();
      const after = await read(page, request, "/cart");
      expect(after.stage).toBe("cart");
      expect(after.lines).toEqual([]);
    }
  });
