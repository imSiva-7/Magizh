import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { encode } from "next-auth/jwt";

test.beforeEach(async ({ page, context, baseURL }) => {
  loadEnvConfig(process.cwd(), true);
  test.skip(!process.env.NEXTAUTH_SECRET, "Local auth secret required");
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { role: "admin" }, maxAge: 300 });
  await context.addCookies([{ name: "__Secure-next-auth.session-token", value: token, domain: new URL(baseURL).hostname, path: "/", secure: true }]);
  await page.clock.install({ time: new Date("2026-10-18T06:00:00Z") });
  const customers = ["Alpha Shop", "Beta Cafe", "City Store", "Receipt Only"].map((customerName, index) => ({ _id: `c${index}`, customerName, customerType: "Retail" }));
  const orders = customers.slice(0, 3).map((customer, index) => ({ _id: `order${index}`, customerId: customer._id, customerName: customer.customerName, date: index === 1 ? "2026-10-02" : "2026-10-01", totalAmount: index === 2 ? 150 : 200, paymentStatus: "Not Paid", items: [] }));
  await page.route("**/api/**", route => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() !== "GET") throw new Error("Ranking previews never write live data");
    if (url.pathname === "/api/auth/session") return route.fulfill({ json: { user: { role: "admin" }, expires: "2099-01-01" } });
    if (url.pathname === "/api/customer") return route.fulfill({ json: customers });
    const included = orders.filter(row => (!url.searchParams.get("startDate") || row.date >= url.searchParams.get("startDate")) && (!url.searchParams.get("endDate") || row.date <= url.searchParams.get("endDate")));
    if (url.pathname === "/api/customer/order/history") return route.fulfill({ json: { orders: included, summary: { orderCount: included.length, totalAmount: included.reduce((sum, row) => sum + row.totalAmount, 0) } } });
    if (url.pathname === "/api/customer/payment-summary") return route.fulfill({ json: { customers: [
      ...included.map(row => ({ customerId: row.customerId, totalOrders: 1, totalAmount: row.totalAmount, receivedAmount: 0, receiptCount: 0, salesDaily: [{ date: row.date, totalAmount: row.totalAmount, totalOrders: 1 }] })),
      { customerId: "c3", totalOrders: 0, totalAmount: 0, receivedAmount: 99999, receiptCount: 1, receiptsDaily: [{ date: "2026-10-01", receivedAmount: 99999 }] },
    ] } });
    return route.fulfill({ json: [] });
  });
});

test("payments leaderboard shares sales ties and follows the selected period", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/customer/payments");
  const board = page.getByRole("region", { name: "Customer sales ranking" });
  await expect(board.locator('[data-customer-rank="1"]')).toHaveCount(2);
  await expect(board.locator('[data-customer-rank="1"]')).toHaveText([/Joint top customer/, /Joint top customer/]);
  await expect(board.getByRole("link", { name: "Receipt Only" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await board.screenshot({ path: "test-results/customer-rankings-mobile.png" });
  await page.getByLabel("To Date", { exact: true }).fill("2026-10-01");
  await expect(board.locator('[data-customer-rank="1"]')).toHaveCount(1);
  await expect(board.getByRole("link", { name: "Beta Cafe" })).toHaveCount(0);
  await expect(board.locator('[data-customer-rank="1"]')).toContainText("Top customer");
  await page.getByLabel("From Date", { exact: true }).fill("2026-10-01");
  await page.getByLabel("To Date", { exact: true }).fill("2026-10-18");
  await page.getByLabel("From Date", { exact: true }).fill("2026-10-18");
  await expect(board).toContainText("No sales to rank in this period.");
  await page.goto("/customer/order/history");
  await expect(page.getByRole("table").getByRole("link", { name: "Alpha Shop" })).toBeVisible();
  await expect(page.getByRole("table").locator("[data-customer-rank]")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Customer sales ranking" })).toHaveCount(0);
});

test("payments leaderboard keeps full-period sales ranks while customer search filters account cards", async ({ page }) => {
  await page.goto("/customer/payments");
  const board = page.getByRole("region", { name: "Customer sales ranking" });
  await expect(board.locator('[data-customer-rank="1"]')).toHaveCount(2);
  await page.getByPlaceholder("Search by name").fill("City");
  await expect(board.getByRole("link", { name: "Alpha Shop" })).toBeVisible();
  await expect(board.locator('[data-customer-rank="3"]')).toBeVisible();
  await expect(board.getByRole("link", { name: "Receipt Only" })).toHaveCount(0);
});
