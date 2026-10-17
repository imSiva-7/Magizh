import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { encode } from "next-auth/jwt";

const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const previousMonth = new Date(`${today}T00:00:00Z`);
previousMonth.setUTCDate(0);
const earlierDate = previousMonth.toISOString().slice(0, 10);
const customer = { _id: "aaaaaaaaaaaaaaaaaaaaaaaa", customerName: "Corner Shop", customerType: "Retail", customerNumber: "9876543210", milkPrice: 40, gheePrice: 500 };

async function setup(page, context, baseURL, { failOnce = false } = {}) {
  loadEnvConfig(process.cwd(), true);
  test.skip(!process.env.NEXTAUTH_SECRET, "Local auth secret required");
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { role: "employee", name: "Order preview" }, maxAge: 300 });
  const domain = new URL(baseURL).hostname;
  await context.addCookies([{ name: "__Secure-next-auth.session-token", value: token, domain, path: "/", secure: true }]);
  const orders = [], writes = [];
  await page.route("**/api/**", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname === "/api/customer/order" && request.method() === "POST") {
      const body = request.postDataJSON(); writes.push(body);
      if (failOnce && writes.length === 1) return route.fulfill({ status: 400, json: { error: "Insufficient stock for milk" } });
      orders.push({ ...body, _id: "bbbbbbbbbbbbbbbbbbbbbbbb" });
      return route.fulfill({ status: 201, json: orders.at(-1) });
    }
    if (request.method() !== "GET") throw new Error("Unmocked writes are forbidden");
    if (url.pathname === "/api/auth/session") return route.fulfill({ json: { user: { role: "employee", email: "staff@example.test" }, expires: "2099-01-01" } });
    if (url.pathname === "/api/customer") return route.fulfill({ json: [customer] });
    const included = orders.filter(order => (!url.searchParams.get("startDate") || order.date >= url.searchParams.get("startDate")) && (!url.searchParams.get("endDate") || order.date <= url.searchParams.get("endDate")));
    const amount = included.reduce((sum, row) => sum + row.totalAmount, 0);
    if (url.pathname === "/api/customer/order/history") return route.fulfill({ json: { orders: included, summary: { orderCount: included.length, totalAmount: amount } } });
    if (url.pathname === "/api/customer/payment-summary") return route.fulfill({ json: { customers: [{ customerId: customer._id, totalOrders: included.length, totalAmount: amount, receivedAmount: 0, receiptCount: 0, salesDaily: included.map(row => ({ date: row.date, totalOrders: 1, totalAmount: row.totalAmount })) }] } });
    return route.fulfill({ json: [] });
  });
  return writes;
}

test("staff can create an order from an always-reachable mobile launcher with saved prices", async ({ page, context, baseURL }) => {
  const writes = await setup(page, context, baseURL);
  await page.setViewportSize({ width: 390, height: 640 });
  await page.goto("/customer/order/history");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const launcher = page.getByRole("button", { name: "New order", exact: true });
  await expect(launcher).toBeInViewport();
  await launcher.focus(); await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "New order", exact: true });
  await expect(dialog.getByLabel("Search customers")).toBeFocused();
  await dialog.getByLabel("Search customers").fill("987654");
  await dialog.getByRole("button", { name: /Corner Shop/ }).click();
  await expect(dialog.getByLabel("Order date")).toBeFocused();
  await dialog.getByLabel("Order date").fill(earlierDate);
  await dialog.getByLabel("Milk quantity (L)").fill("2.5");
  await expect(dialog.getByLabel("Butter quantity (kg)")).toBeDisabled();
  await dialog.getByLabel("GST", { exact: true }).selectOption("exclusive");
  await expect(dialog.getByText("Order total", { exact: true }).locator("..")).toContainText("₹105.00");
  await expect(dialog.getByRole("button", { name: "Save order", exact: true })).toBeInViewport();
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await dialog.screenshot({ path: "test-results/history-new-order-mobile.png" });
  await dialog.getByRole("button", { name: "Save order", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(launcher).toBeFocused();
  await expect(page.getByLabel("From Date", { exact: true })).toHaveValue(earlierDate);
  await expect(page.getByRole("link", { name: "Corner Shop", exact: true })).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ customerId: customer._id, totalAmount: 105, gstType: "exclusive", gstRate: 5, affectStockValue: false, paymentStatus: "Not Paid", items: [{ product: "Milk", quantity: 2.5, ratePerUnit: 40, totalAmount: 105 }] });
});

test("failed saves retain input and double clicks submit once; Escape restores focus", async ({ page, context, baseURL }) => {
  const writes = await setup(page, context, baseURL, { failOnce: true });
  await page.goto("/customer/order/history");
  const launcher = page.getByRole("button", { name: "New order", exact: true });
  await launcher.click();
  const dialog = page.getByRole("dialog", { name: "New order", exact: true });
  await dialog.getByRole("button", { name: /Corner Shop/ }).click();
  await dialog.getByLabel("Milk quantity (L)").fill("3");
  await dialog.getByLabel("Deduct quantities from stock").check();
  await dialog.getByRole("button", { name: "Save order", exact: true }).evaluate(button => { button.click(); button.click(); });
  await expect(dialog.getByRole("alert")).toHaveText("Insufficient stock for milk");
  await expect(dialog.getByLabel("Milk quantity (L)")).toHaveValue("3");
  expect(writes).toHaveLength(1);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(launcher).toBeFocused();
});
