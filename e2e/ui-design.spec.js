import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { encode } from "next-auth/jwt";

test("workspace navigation supports keyboard and mobile focus", async ({ page }) => {
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: {} }));
  await page.goto("/login");
  await page.getByRole("link", { name: "Magizh Dairy home" }).focus();
  const production = page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Productions", exact: true });
  await production.focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Production History", exact: true }).first()).toBeFocused();
  await page.screenshot({ path: "test-results/design-login-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open menu" }).click();
  const menu = page.getByRole("dialog", { name: "Mobile navigation menu" });
  await expect(menu.getByRole("button", { name: "Close menu" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(menu.getByRole("link").last()).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(menu.getByRole("button", { name: "Close menu" })).toBeFocused();
  await expect(menu.getByRole("link", { name: "Stock", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/design-mobile-menu.png" });
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open menu" })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: "test-results/design-login-mobile.png", fullPage: true });
});

test.describe("Operational page design", () => {
  test.beforeEach(async ({ page, context, baseURL }) => {
    // Use a short-lived local test session. All data requests below are mocked.
    loadEnvConfig(process.cwd(), true);
    test.skip(!process.env.NEXTAUTH_SECRET, "Local auth secret is required for protected page previews");
    const token = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { role: "admin", name: "Design preview", email: "preview@example.test" }, maxAge: 300 });
    const domain = new URL(baseURL).hostname;
    await context.addCookies([
      { name: "next-auth.session-token", value: token, domain, path: "/", httpOnly: true, sameSite: "Lax" },
      { name: "__Secure-next-auth.session-token", value: token, domain, path: "/", httpOnly: true, secure: true, sameSite: "Lax" },
    ]);
    await page.route("**/api/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/auth/session") return route.fulfill({ json: { user: { name: "Design preview", email: "preview@example.test", role: "admin" }, expires: "2099-01-01" } });
      if (path.startsWith("/api/analytics/")) return route.fulfill({ json: {
        daily: [{ date: "2026-10-01", milk: 120, batches: 3, fat: 4.2, snf: 8.5, amount: 5000, orders: 4 }, { date: "2026-10-02", milk: 180, batches: 5, fat: 4.5, snf: 8.4, amount: 7200, orders: 6 }],
        overall: { totalOrders: 10, totalAmount: 12200, totalMilk: 300, totalRecords: 2, paidAmount: 10000, dueAmount: 2200 },
        totals: { milk: 300, totalBatches: 8, avgFat: 4.3, avgSnf: 8.5 }, products: [], payment: [],
      } });
      if (path === "/api/stock/balance") return route.fulfill({ json: { butter: 12, cream: 30, curd: 60, ghee: 8, soft_paneer: 25, premium_paneer: 15 } });
      if (path === "/api/stock/thresholds") return route.fulfill({ json: { thresholds: {} } });
      return route.fulfill({ json: [] });
    });
  });

  for (const [path, title] of [["/customer", "Customers"], ["/supplier", "Suppliers"], ["/employee", "Employees"], ["/productions", "Production Entry"], ["/stock", "Stock Management"], ["/productions/analytics", "Production Analytics"], ["/customer/analytics", "Customer Analytics"], ["/supplier/analytics", "Supplier Analytics"]]) {
    test(`${title} fits desktop and mobile`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
      await expect(page.locator("#main-content")).not.toContainText("Loading");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      const label = path.slice(1).replaceAll("/", "-");
      await page.screenshot({ path: `test-results/design-${label}-desktop.png`, fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      await page.screenshot({ path: `test-results/design-${label}-mobile.png`, fullPage: true });
    });
  }
});
