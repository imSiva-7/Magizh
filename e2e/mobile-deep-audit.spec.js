import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { encode } from "next-auth/jwt";

test.use({ hasTouch: true, isMobile: true });

const id = "aaaaaaaaaaaaaaaaaaaaaaaa";
const date = "2026-10-18";
const customerName = "Green Valley Restaurant and Catering Services " + "LongCustomerName".repeat(5);
const customer = { _id: id, customerName, customerType: "Restaurant", customerNumber: "9876543210", milkPrice: 4000, gheePrice: 500 };
const order = { _id: "order", customerId: id, customerName, customerType: "Restaurant", date, totalAmount: 12345678.9, items: [{ product: "Milk", quantity: 1234.5, ratePerUnit: 4000, totalAmount: 4938000 }], paymentStatus: "Not Paid", comment: "LongComment".repeat(25) };
const supplier = { _id: id, supplierName: customerName, supplierType: "Society", supplierPhone: "9876543210", supplierTSRate: 300 };
const procurement = { _id: "procurement", supplierId: id, supplierName: customerName, date, time: "AM", milkQuantity: 123456.75, fatPercentage: 3.5, snfPercentage: 8.5, supplierTSRate: 300, rate: 36, totalAmount: 4444443, paymentStatus: "Not Paid" };
const analytics = { daily: [{ date, milk: 123456.75, batches: 12345, fat: 3.5, snf: 8.5, amount: order.totalAmount, orders: 12345 }], overall: { totalOrders: 12345, totalAmount: order.totalAmount, totalMilk: 123456.75, totalRecords: 12345, paidAmount: 1234567, dueAmount: 11111111.9 }, totals: { milk: 123456.75, totalBatches: 12345, avgFat: 3.5, avgSnf: 8.5 }, products: [], payment: [] };

async function setup(page, context, baseURL) {
  loadEnvConfig(process.cwd(), true);
  test.skip(!process.env.NEXTAUTH_SECRET, "Local auth secret required");
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { role: "admin", name: "Mobile audit" }, maxAge: 600 });
  const domain = new URL(baseURL).hostname;
  await context.addCookies(["next-auth.session-token", "__Secure-next-auth.session-token"].map(name => ({ name, value: token, domain, path: "/", secure: name.startsWith("__Secure") })));
  await page.clock.install({ time: new Date("2026-10-18T06:00:00Z") });
  await page.route("**/api/**", route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    if (request.method() !== "GET") throw new Error("Audit must never write live data");
    let json = [];
    if (path === "/api/auth/session") json = { user: { role: "admin", name: "Mobile audit" }, expires: "2099-01-01" };
    if (path === "/api/customer") json = url.searchParams.has("customerId") ? customer : [customer];
    if (path === "/api/customer/order") json = [order];
    if (path === "/api/customer/order/history") json = { orders: [order], summary: { orderCount: 1, totalAmount: order.totalAmount } };
    if (path === "/api/customer/payment-summary") json = { customers: [{ customerId: id, totalOrders: 1, totalAmount: order.totalAmount, receivedAmount: 100, receiptCount: 1, salesDaily: [{ date, totalOrders: 1, totalAmount: order.totalAmount }], receiptsDaily: [{ date, receivedAmount: 100 }] }] };
    if (path === "/api/customer/total_orders") json = { totalOrders: 1, totalAmount: order.totalAmount, paidAmount: 100, dueAmount: order.totalAmount - 100 };
    if (path === "/api/customer/ledger") json = { payments: [] };
    if (path === "/api/supplier") json = url.searchParams.has("supplierId") ? supplier : [supplier];
    if (path.startsWith("/api/supplier/procurement")) json = [procurement];
    if (path === "/api/employee") json = [{ _id: id, empID: "EMP001", name: customerName, gender: "Male", salary: 1234567 }];
    if (path === "/api/attendance/history") json = { records: [], summary: {} };
    if (path === "/api/attendance/rankings") json = { month: "2026-10", rankings: [] };
    if (path === "/api/stock/balance") json = { butter: 123456.75, cream: 20, curd: 50, ghee: 4, soft_paneer: 8, premium_paneer: 4 };
    if (path === "/api/stock/thresholds") json = { thresholds: {} };
    if (path === "/api/production/history") json = [{ _id: "production", date, batch: "AM", milk_quantity: 123456.75, fat_percentage: 3.5, snf_percentage: 8.5 }];
    if (path.startsWith("/api/analytics/")) json = analytics;
    return route.fulfill({ json });
  });
}

for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [844, 390]]) {
  test(`long names, large totals, and entry controls fit ${width}x${height}`, async ({ page, context, baseURL }) => {
    await setup(page, context, baseURL);
    await page.setViewportSize({ width, height });
    const crashes = [];
    page.on("pageerror", error => crashes.push(error.message));
    for (const path of ["/customer", "/supplier", "/employee", "/customer/order/history", "/supplier/procurement/history", `/customer/order?customerId=${id}`, `/supplier/procurement?supplierId=${id}`, "/customer/payments", "/supplier/payments", "/customer/analytics", "/supplier/analytics", "/productions/analytics", "/productions/history", "/productions", "/stock"]) {
      await test.step(path, async () => {
        await page.goto(path);
        await expect(page.locator("main")).not.toContainText(/Loading (customers|suppliers|employees|orders|records|data|analytics)/i);
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth), { message: `${path} page overflows` }).toBeLessThanOrEqual(width);
        const clippedStats = await page.locator('[class*="stat_value"], [class*="statValue"], [class*="global_value"], [class*="stat_card_value"]').evaluateAll(elements => elements.filter(el => el.getClientRects().length && el.scrollWidth > el.clientWidth + 1).map(el => ({ text: el.textContent, width: el.clientWidth, content: el.scrollWidth })));
        expect.soft(clippedStats, `${path} stats overflow their cards`).toEqual([]);
        if (path.startsWith("/customer/order?")) {
          const payment = page.getByRole("button", { name: "Record payment", exact: true });
          await expect(payment).toContainText("Record payment");
          const milk = page.getByLabel("Milk", { exact: true });
          await expect(milk).toHaveAttribute("inputmode", "decimal");
          await page.locator('label[for="order-milk"]').click();
          await expect(milk).toBeFocused();
        }
      });
    }
    await page.goto("/customer/order/history");
    await page.getByRole("button", { name: "New order", exact: true }).click();
    const panel = page.getByRole("region", { name: "New order", exact: true });
    await panel.getByRole("button", { name: /Green Valley Restaurant/ }).click();
    await panel.getByLabel("Milk quantity (L)").fill("1234.5");
    await expect(panel.getByLabel("Milk amount", { exact: true })).toHaveCount(0);
    await expect(panel.getByLabel("Order Total", { exact: true })).toHaveAttribute("readonly", "");
    await panel.getByRole("button", { name: "Create Order", exact: true }).scrollIntoViewIfNeeded();
    await expect(panel.getByRole("button", { name: "Create Order", exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 320) await panel.screenshot({ path: "test-results/audit-inline-order-320.png" });
    expect(crashes).toEqual([]);
  });
}

test("payment dialog keeps focus inside, closes with Escape and restores its launcher", async ({ page, context, baseURL }) => {
  await setup(page, context, baseURL);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/customer/payments");
  const launcher = page.getByRole("button", { name: "Record payment", exact: true });
  await launcher.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close payment dialog", exact: true })).toBeInViewport();
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await dialog.screenshot({ path: "test-results/audit-payment-320.png" });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).focus();
  await expect(dialog.getByRole("button", { name: "Close payment dialog", exact: true })).toBeInViewport();
  await page.keyboard.press("Tab");
  expect.soft(await dialog.evaluate(el => el.contains(document.activeElement)), "Tab must stay inside the payment modal").toBe(true);
  await dialog.getByLabel("Amount received (₹)").focus();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(launcher).toBeFocused();
});

test.describe("IST procurement sessions", () => {
  test.use({ timezoneId: "America/Los_Angeles" });
  test("procurement defaults use India's AM/PM on a device abroad", async ({ page, context, baseURL }) => {
    await setup(page, context, baseURL);
    await page.clock.setFixedTime(new Date("2026-10-18T07:00:00Z"));
    await page.goto(`/supplier/procurement?supplierId=${id}`);
    await expect(page.getByLabel("Select time period")).toHaveValue("PM");
    await page.goto("/supplier/procurement/history");
    await page.getByRole("button", { name: /Add Procurement/ }).click();
    await page.getByRole("button", { name: /Green Valley Restaurant/ }).click();
    await expect(page.getByRole("combobox", { name: "Time Period", exact: true })).toHaveValue("PM");
  });
});

test("order detail rejects malformed quantities before any write", async ({ page, context, baseURL }) => {
  await setup(page, context, baseURL);
  await page.goto(`/customer/order?customerId=${id}`);
  const milk = page.getByLabel("Milk", { exact: true });
  await milk.fill("1.2.3");
  await page.locator('form button[type="submit"]').click();
  await expect(milk).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Enter a valid quantity", { exact: true })).toBeVisible();
});

test("production analytics reports a failed load and can retry", async ({ page, context, baseURL }) => {
  await setup(page, context, baseURL);
  let fail = true;
  await page.route("**/api/analytics/productions?**", route => route.fulfill(fail ? { status: 503, json: { error: "Offline" } } : { json: analytics }));
  await page.goto("/productions/analytics");
  await expect(page.locator("main").getByRole("alert")).toContainText(/could not|failed/i);
  await expect(page.getByRole("heading", { name: "Summary", exact: true })).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: /retry/i }).click();
  await expect(page.getByRole("heading", { name: "Summary", exact: true })).toBeVisible();
});

for (const entity of ["customer", "employee"]) {
  test(`${entity} load failures offer retry instead of a false empty directory`, async ({ page, context, baseURL }) => {
    await setup(page, context, baseURL);
    await page.setViewportSize({ width: 320, height: 568 });
    let fail = true;
    await page.route(`**/api/${entity}`, route => fail ? route.fulfill({ status: 503, json: { error: "Offline" } }) : route.fallback());
    await page.goto(`/${entity}`);
    const alert = page.locator('[data-filter="card"][role="alert"]');
    await expect(alert).toContainText(/could not be loaded/i);
    await expect(page.getByText(`No ${entity}s found`, { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Create Your First/ })).toHaveCount(0);
    fail = false;
    await alert.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page.getByRole("table").getByRole("link", { name: customerName, exact: true })).toBeVisible();
    await expect(alert).toHaveCount(0);
  });
}

for (const path of ["/customer/order/history", "/supplier/procurement/history", "/productions/analytics", "/productions/history"]) {
  test(`${path} keeps the newest date range when an older request finishes last`, async ({ page, context, baseURL }) => {
    await setup(page, context, baseURL);
    const endpoint = path.startsWith("/customer") ? "/api/customer/order/history" : path.startsWith("/supplier") ? "/api/supplier/procurement/history" : path.endsWith("analytics") ? "/api/analytics/productions" : "/api/production/history";
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let requested;
    const slow = new Promise(resolve => { requested = resolve; });
    await page.route(`**${endpoint}?**`, async route => {
      const url = new URL(route.request().url());
      const start = url.searchParams.get("startDate") ?? url.searchParams.get("fromDate");
      if (start === "") { requested(); await gate; }
      else if (!start) { requested(); await gate; }
      if (path.startsWith("/customer")) return route.fulfill({ json: { orders: start ? [order] : [], summary: { orderCount: start ? 1 : 0, totalAmount: start ? order.totalAmount : 0 } } }).catch(() => {});
      if (path.startsWith("/supplier")) return route.fulfill({ json: start ? [procurement] : [] }).catch(() => {});
      if (path.endsWith("analytics")) return route.fulfill({ json: { ...analytics, totals: { ...analytics.totals, totalBatches: start ? 12345 : 0 } } }).catch(() => {});
      return route.fulfill({ json: start ? [{ _id: "production", date, batch: "AM", milk_quantity: 123456.75 }] : [] }).catch(() => {});
    });
    await page.goto(path);
    await expect(page.locator("main")).not.toContainText(/Loading (orders|procurement|production|analytics)/i);
    await page.locator('[data-filter="actions"] button').filter({ hasText: /^Clear/ }).click();
    await slow;
    const latest = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === endpoint && (url.searchParams.get("startDate") ?? url.searchParams.get("fromDate")) === date;
    });
    if (path === "/productions/history") await page.getByLabel("Select start date", { exact: true }).fill(date);
    else await page.getByRole("button", { name: "Today", exact: true }).click();
    await latest;
    await expect(page.locator("main")).not.toContainText(/Loading (orders|procurement|production|analytics)/i);
    const result = path.endsWith("analytics") ? page.getByRole("heading", { name: "Summary", exact: true }).locator("../..") : page.locator("main table").first();
    await expect(result).toBeVisible();
    const before = await result.innerText();
    release();
    await page.waitForLoadState("networkidle");
    await expect(result).toHaveText(before, { useInnerText: true });
  });
}
