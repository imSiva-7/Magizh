import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { encode } from "next-auth/jwt";
import { currentGoalPeriod } from "../src/lib/monthly-goals.mjs";

test("home charts aggregate records, follow date filters, and fit mobile", async ({ page, context, baseURL }) => {
  loadEnvConfig(process.cwd(), true);
  test.skip(!process.env.NEXTAUTH_SECRET, "Local auth secret required");
  const user = { role: "admin", name: "Chart preview" };
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET, token: user, maxAge: 300 });
  const domain = new URL(baseURL).hostname;
  await context.addCookies([
    { name: "next-auth.session-token", value: token, domain, path: "/" },
    { name: "__Secure-next-auth.session-token", value: token, domain, path: "/", secure: true },
  ]);
  await page.route("**/api/**", route => {
    if (route.request().method() !== "GET") throw new Error("Chart previews never write business data");
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/session") return route.fulfill({ json: { user, expires: "2099-01-01" } });
    if (path === "/api/customer/account-summary") return route.fulfill({ json: { paidAmount: 4200, dueAmount: 800, customers: [] } });
    if (path === "/api/overview/goals") return route.fulfill({ json: { ...currentGoalPeriod(), targets: { sales: null, profit: null }, actual: { sales: 0, procurement: 0, profit: 0 } } });
    return route.fulfill({ json: [] });
  });
  const orders = [
    { date: "2026-10-01", totalAmount: 1200, paymentStatus: "Paid" },
    { date: "2026-10-01", totalAmount: 800, paymentStatus: "Not Paid", customerId: "c1", customerName: "Test customer" },
    { date: "2026-10-03", totalAmount: 3000, paymentStatus: "Paid" },
  ];
  const procurements = [
    { date: "2026-10-01", totalAmount: 500, milkQuantity: 10, paymentStatus: "Paid" },
    { date: "2026-10-03", totalAmount: 900, milkQuantity: 18, paymentStatus: "Not Paid", supplierId: "s1", supplierName: "Test supplier" },
  ];
  const filtered = (route, entries) => {
    const params = new URL(route.request().url()).searchParams;
    return entries.filter((entry) => (!params.get("startDate") || entry.date >= params.get("startDate")) && (!params.get("endDate") || entry.date <= params.get("endDate")));
  };
  await page.route("**/api/customer/order/history?*", (route) => {
    const records = filtered(route, orders);
    return route.fulfill({ json: { orders: records, summary: {
      orderCount: records.length,
      totalAmount: records.reduce((sum, row) => sum + row.totalAmount, 0),
      paidAmount: records.filter((row) => row.paymentStatus === "Paid").reduce((sum, row) => sum + row.totalAmount, 0),
      dueAmount: records.filter((row) => row.paymentStatus === "Not Paid").reduce((sum, row) => sum + row.totalAmount, 0),
    } } });
  });
  await page.route("**/api/supplier/procurement/history?*", (route) => route.fulfill({ json: filtered(route, procurements) }));
  await page.route("**/api/production/history?*", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/stock/balance", (route) => route.fulfill({ json: {} }));
  await page.goto("/");
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  const trend = page.getByRole("region", { name: "Sales & procurement" });
  const payment = page.getByRole("region", { name: "Paid & outstanding" });
  await expect(trend.getByRole("application")).toBeVisible();
  await expect(page.getByTestId("stat-trend")).toHaveCount(6);
  await expect(trend).not.toContainText("Order value compared with the cost of milk procured");
  await expect(payment).not.toContainText("Customer receipts and supplier payments for records in the selected period");
  await expect(page.getByTestId("stat-trend").first()).toHaveAttribute("data-points", "2");
  await expect(page.getByTestId("stat-trend").first().locator("path")).toHaveAttribute("fill", "none");
  await trend.getByText("View trend data", { exact: true }).click();
  await expect(trend.getByRole("row").filter({ hasText: "01/10/26" })).toContainText("₹2,000");
  await expect(trend.getByRole("row").filter({ hasText: "02/10/26" })).toContainText("₹0");
  await payment.getByText("View payment data", { exact: true }).click();
  await expect(payment.getByRole("row").filter({ hasText: "Customers" })).toContainText("₹4,200");
  await expect(payment.getByRole("row").filter({ hasText: "Suppliers" })).toContainText("₹900");
  await trend.getByText("View trend data", { exact: true }).click();
  await payment.getByText("View payment data", { exact: true }).click();
  await trend.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/home-charts-desktop.png" });
  await page.getByLabel("To", { exact: true }).fill("2026-10-02");
  await trend.getByText("View trend data", { exact: true }).click();
  await expect(trend.getByRole("row").filter({ hasText: "03/10/26" })).toHaveCount(0);
  await payment.getByText("View payment data", { exact: true }).click();
  await expect(payment.getByRole("row").filter({ hasText: "Customers" })).toContainText("₹1,200");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(trend.getByRole("application")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await trend.getByText("View trend data", { exact: true }).click();
  await trend.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/home-charts-mobile.png" });
  await page.getByLabel("From", { exact: true }).fill("2026-10-02");
  await expect(trend).toContainText("No sales or procurement records");
  await page.getByLabel("From", { exact: true }).fill("2026-07-01");
  await page.getByLabel("To", { exact: true }).fill("2026-10-03");
  await expect(trend).toContainText("MONTHLY TREND");
  await trend.getByText("View trend data", { exact: true }).click();
  await expect(trend.getByRole("row").filter({ hasText: "10/26" })).toContainText("₹5,000");
  await expect(trend.getByRole("row").filter({ hasText: "10/26" })).toContainText("₹1,400");
});
