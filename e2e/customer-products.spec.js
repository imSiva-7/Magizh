import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { encode } from "next-auth/jwt";

for (const width of [320, 1280]) {
  test(`customer analytics shows product units and readable bar comparisons at ${width}px`, async ({ page, context, baseURL }) => {
    loadEnvConfig(process.cwd(), true);
    test.skip(!process.env.NEXTAUTH_SECRET, "Local auth secret required");
    const token = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { role: "admin" }, maxAge: 300 });
    await context.addCookies([{ name: "__Secure-next-auth.session-token", value: token, domain: new URL(baseURL).hostname, path: "/", secure: true }]);
    await page.clock.install({ time: new Date("2026-10-18T06:00:00Z") });
    await page.setViewportSize({ width, height: 844 });
    const products = [
      { name: "Milk", quantity: 120.5, amount: 4820 }, { name: "Ghee", quantity: 2.25, amount: 1350 }, { name: "Butter", quantity: 3.75, amount: 1500 }, { name: "Fresh Cream", quantity: 5, amount: 1500 }, { name: "Curd", quantity: 12.5, amount: 750 }, { name: "Soft Paneer", quantity: 4.25, amount: 1700 }, { name: "Premium Paneer", quantity: 7.5, amount: 3375 },
    ];
    await page.route("**/api/**", route => {
      const request = route.request(), url = new URL(request.url());
      if (request.method() !== "GET") throw new Error("Product previews never write live data");
      if (url.pathname === "/api/auth/session") return route.fulfill({ json: { user: { role: "admin" }, expires: "2099-01-01" } });
      if (url.pathname === "/api/analytics/customers") {
        const included = (!url.searchParams.get("startDate") || url.searchParams.get("startDate") <= "2026-10-01") && (!url.searchParams.get("endDate") || url.searchParams.get("endDate") >= "2026-10-01");
        return route.fulfill({ json: { daily: included ? [{ date: "2026-10-01", orders: 2, amount: 14995, paid: 2000, due: 12995 }] : [], products: included ? products : [], payment: included ? [{ status: "Paid", count: 1 }, { status: "Not Paid", count: 1 }] : [], overall: included ? { totalOrders: 2, totalItems: 7, totalAmount: 14995, paidAmount: 2000, dueAmount: 12995 } : {} } });
      }
      return route.fulfill({ json: [] });
    });
    await page.goto("/customer/analytics");
    const sold = page.getByRole("region", { name: "Products sold", exact: true });
    await expect(sold.getByText("Milk", { exact: true }).locator("..")).toContainText("120.50 L");
    await expect(sold.getByText("Butter", { exact: true }).locator("..")).toContainText("3.75 kg");
    const chart = page.getByRole("region", { name: "Product sales breakdown" });
    await expect(chart.getByRole("list", { name: "Products by sales value" }).getByRole("listitem")).toHaveCount(7);
    await expect(page.locator(".recharts-pie")).toHaveCount(0);
    await chart.getByRole("button", { name: "Litres sold", exact: true }).click();
    const litres = chart.getByRole("list", { name: "Products sold in L" });
    await expect(litres.getByRole("listitem")).toHaveCount(2);
    await expect(litres.getByText("Ghee", { exact: true }).locator("..")).toContainText("2.25 L");
    await chart.getByRole("button", { name: "Kilograms sold", exact: true }).click();
    await expect(chart.getByRole("list", { name: "Products sold in kg" }).getByRole("listitem")).toHaveCount(5);
    await expect(chart.getByRole("table")).toContainText("120.50 L");
    await expect(page.getByRole("region", { name: "Order payment status breakdown" })).toContainText("1 order");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await chart.screenshot({ path: `test-results/customer-products-${width}.png` });
    await page.getByLabel("From Date", { exact: true }).fill("2026-10-18");
    await expect(chart).toContainText("No product sales in this period.");
    await expect(page.getByRole("region", { name: "Products sold", exact: true })).toHaveCount(0);
  });
}
