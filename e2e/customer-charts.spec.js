import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { encode } from "next-auth/jwt";

const today = new Date().toLocaleDateString("en-CA");
const customer = { _id: "chart-customer", customerName: "Chart Shop", customerType: "Retail" };
const orders = [
  { _id: "a", customerId: customer._id, customerName: customer.customerName, date: today, totalAmount: 100, paymentStatus: "Paid", items: [{ product: "Milk", quantity: 2, totalAmount: 100 }] },
  { _id: "b", customerId: customer._id, customerName: customer.customerName, date: today, totalAmount: 250, paymentStatus: "Not Paid", items: [{ product: "Butter", quantity: 1, totalAmount: 250 }] },
];

test.beforeEach(async ({ context, baseURL }) => {
  loadEnvConfig(process.cwd(), true);
  test.skip(!process.env.NEXTAUTH_SECRET, "Local auth secret required");
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { role: "admin", name: "Customer chart preview" }, maxAge: 300 });
  const domain = new URL(baseURL).hostname;
  await context.addCookies([{ name: "next-auth.session-token", value: token, domain, path: "/" }, { name: "__Secure-next-auth.session-token", value: token, domain, path: "/", secure: true }]);
});

async function mockData(page, fail = false) {
  let failed = false;
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    if (route.request().method() !== "GET") throw new Error("Chart tests must never write live data");
    if (url.pathname === "/api/auth/session") return route.fulfill({ json: { user: { role: "admin", name: "Chart preview" }, expires: "2099-01-01" } });
    if (url.pathname === "/api/customer") return route.fulfill({ json: url.searchParams.has("customerId") ? customer : [customer] });
    if (url.pathname === "/api/customer/order") return route.fulfill({ json: orders });
    if (url.pathname === "/api/customer/ledger") return route.fulfill({ json: { payments: [{ date: `${today}T04:00:00Z`, amount: 20 }] } });
    const included = (!url.searchParams.get("startDate") || url.searchParams.get("startDate") <= today) && (!url.searchParams.get("endDate") || url.searchParams.get("endDate") >= today);
    if (url.pathname === "/api/customer/order/history") return route.fulfill({ json: { orders: included ? orders : [], summary: included ? { totalAmount: 350, orderCount: 2, paidAmount: 100, dueAmount: 250 } : { totalAmount: 0, orderCount: 0 } } });
    if (url.pathname === "/api/customer/payment-summary") return route.fulfill({ json: { customers: included ? [{ customerId: customer._id, totalOrders: 2, totalAmount: 350, receivedAmount: 20, receiptCount: 1, salesDaily: [{ date: today, totalOrders: 2, totalAmount: 350 }], receiptsDaily: [{ date: today, receivedAmount: 20, receiptCount: 1 }] }] : [] } });
    if (url.pathname === "/api/customer/total_orders") return route.fulfill({ json: { totalAmount: 350, totalOrders: 2, paidAmount: 20, dueAmount: 330 } });
    if (url.pathname === "/api/analytics/customers") {
      if (fail && !failed) { failed = true; return route.fulfill({ status: 503, json: { error: "Unavailable" } }); }
      const included = (!url.searchParams.get("startDate") || url.searchParams.get("startDate") <= today) && (!url.searchParams.get("endDate") || url.searchParams.get("endDate") >= today);
      return route.fulfill({ json: { daily: included ? [{ date: today, orders: 2, amount: 350, paid: 100, due: 250 }] : [], overall: {}, products: [], payment: [] } });
    }
    return route.fulfill({ json: [] });
  });
}

for (const path of ["/customer", "/customer/analytics", "/customer/order/history", "/customer/order?customerId=chart-customer"]) {
  test(`${path} shows sales and order payments with mobile layout`, async ({ page }) => {
    await mockData(page);
    await page.goto(path);
    if (path.includes("history")) await expect(page.getByTestId("stat-trend")).toHaveCount(4);
    if (!path.includes("analytics") && !path.includes("history")) {
      await expect(page.getByRole("heading").first()).toBeVisible();
      await expect(page.getByTestId("customer-trend-chart")).toHaveCount(0);
      await expect(page.getByTestId("customer-payments-chart")).toHaveCount(0);
      await expect(page.getByTestId("stat-trend")).toHaveCount(path.includes("history") || path.includes("?") ? 4 : 0);
      return;
    }
    await expect(page.getByTestId("customer-trend-chart").locator("svg").first()).toBeVisible();
    await expect(page.getByTestId("customer-payments-chart").locator("svg").first()).toBeVisible();
    await page.getByText("View sales chart data", { exact: true }).click();
    await expect(page.getByRole("table", { name: "Customer sales for the selected period" }).getByRole("cell", { name: "₹350", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Orders", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Customer orders", exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    const card = page.getByRole("region", { name: "Customer orders", exact: true });
    await expect.poll(() => card.evaluate(el => el.getBoundingClientRect().width <= innerWidth)).toBeTruthy();
    await card.screenshot({ path: `test-results/customer-${path.includes("analytics") ? "analytics" : path.includes("history") ? "history" : path.includes("?") ? "detail" : "overview"}-mobile.png` });
  });
}

test("analytics can retry chart failures and show an empty period", async ({ page }) => {
  await mockData(page, true);
  await page.goto("/customer/analytics");
  await page.getByRole("button", { name: "Retry charts" }).first().click();
  await expect(page.getByTestId("customer-trend-chart")).toBeVisible();
  await page.getByLabel("From Date", { exact: true }).fill("2020-01-01");
  await page.getByLabel("To Date", { exact: true }).fill("2020-01-02");
  await expect(page.getByText("No orders in this date range.").first()).toBeVisible();
});

test("order history keeps four stats graphs alongside analytics and uses actual receipts", async ({ page }) => {
  await mockData(page);
  await page.goto("/customer/order/history");
  const summary = page.getByRole("region", { name: "Summary", exact: false });
  await expect(summary.getByText("Received", { exact: true }).locator("..")).toContainText("₹20");
  await expect(summary.getByText("AOV", { exact: true }).locator("..")).toContainText("₹175");
  await expect(summary.getByText("AOV", { exact: true }).locator("..").locator("span").last()).toHaveText("₹175");
  await expect(summary.getByTestId("stat-trend")).toHaveCount(4);
  const sparkline = summary.getByTestId("stat-trend").first();
  await expect(sparkline.locator("path")).toHaveCount(1);
  await expect(sparkline.locator("path")).toHaveAttribute("fill", "none");
  expect(await sparkline.evaluate(svg => {
    const card = svg.parentElement.getBoundingClientRect(), line = svg.getBoundingClientRect();
    return line.left >= card.left + card.width * .48 && line.width <= card.width * .51;
  })).toBe(true);
  await expect(summary.getByTestId("customer-trend-chart")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Order history analytics", exact: true })).toBeVisible();
  await expect(page.getByTestId("customer-trend-chart")).toBeVisible();
  await expect(page.getByTestId("customer-payments-chart")).toBeVisible();
  await page.getByLabel("From Date", { exact: true }).fill("2020-01-01");
  await page.getByLabel("To Date", { exact: true }).fill("2020-01-02");
  await expect(summary.getByText("Received", { exact: true }).locator("..")).toContainText("₹0");
  await expect(page.getByRole("heading", { name: "No Orders Found", exact: true })).toBeVisible();
});
