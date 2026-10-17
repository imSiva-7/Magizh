import { test, expect } from "@playwright/test";

test("home charts aggregate records, follow date filters, and fit mobile", async ({ page }) => {
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
  await expect(page.getByTestId("stat-trend")).toHaveCount(8);
  await expect(page.getByTestId("stat-trend").first()).toHaveAttribute("data-points", "2");
  await expect(page.getByTestId("stat-trend").first().locator("path")).toHaveAttribute("fill", "none");
  await trend.getByText("View trend data", { exact: true }).click();
  await expect(trend.getByRole("row").filter({ hasText: "2026-10-01" })).toContainText("₹2,000");
  await expect(trend.getByRole("row").filter({ hasText: "2026-10-02" })).toContainText("₹0");
  await payment.getByText("View payment data", { exact: true }).click();
  await expect(payment.getByRole("row").filter({ hasText: "Customers" })).toContainText("₹4,200");
  await expect(payment.getByRole("row").filter({ hasText: "Suppliers" })).toContainText("₹900");
  await trend.getByText("View trend data", { exact: true }).click();
  await payment.getByText("View payment data", { exact: true }).click();
  await trend.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/home-charts-desktop.png" });
  await page.getByLabel("To", { exact: true }).fill("2026-10-02");
  await trend.getByText("View trend data", { exact: true }).click();
  await expect(trend.getByRole("row").filter({ hasText: "2026-10-03" })).toHaveCount(0);
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
  await expect(trend.getByRole("row").filter({ hasText: "2026-10" })).toContainText("₹5,000");
  await expect(trend.getByRole("row").filter({ hasText: "2026-10" })).toContainText("₹1,400");
});
