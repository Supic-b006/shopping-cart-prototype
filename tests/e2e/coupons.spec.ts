import { test, expect } from "./fixtures";
import { login, closeCoupon, read } from "./helpers";
for (const ac of ["19a", "19b"])
  test(`AC-${ac}: coupon disabled and listed correctly`, async ({
    page,
    request,
  }) => {
    await login(page, "admin01");
    await closeCoupon(page);
    if (ac === "19b") {
      await page.getByTestId("nav-admin-products").click();
      await expect(page.getByTestId("page-admin-products")).toBeVisible();
      await page.getByTestId("nav-admin-coupons").click();
    }
    const row = page.getByTestId("admin-coupon-row-SAVE10");
    await expect(row.getByTestId("admin-coupon-status")).toHaveAttribute(
      "data-status",
      "false",
    );
    await expect(row.getByTestId("admin-coupon-percent")).toHaveAttribute(
      "data-value",
      "10",
    );
    await expect(row.getByTestId("admin-coupon-min-spend")).toHaveAttribute(
      "data-value",
      "1000",
    );
    expect(
      (await read(page, request, "/admin/coupons")).find(
        (c: any) => c.code === "SAVE10",
      ),
    ).toEqual({ code: "SAVE10", percent: 10, minSpend: 1000, active: false });
  });
