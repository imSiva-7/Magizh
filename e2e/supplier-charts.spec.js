import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { encode } from "next-auth/jwt";
const today = new Date().toLocaleDateString("en-CA");
const supplier = { _id: "chart-supplier", supplierName: "Chart Dairy", supplierType: "Farmer", supplierTSRate: 300 };
const records = [
  { _id: "a", supplierId: supplier._id, supplierName: supplier.supplierName, date: today, time: "AM", milkQuantity: 10, totalAmount: 400, fatPercentage: 4, snfPercentage: 8, paymentStatus: "Not Paid", supplierTSRate: 300, rate: 40 },
  { _id: "b", supplierId: supplier._id, supplierName: supplier.supplierName, date: today, time: "PM", milkQuantity: 30, totalAmount: 1500, fatPercentage: 5, snfPercentage: 9, paymentStatus: "Paid", supplierTSRate: 300, rate: 50 },
];
test.beforeEach(async ({ context, baseURL }) => {
  loadEnvConfig(process.cwd(), true);
  test.skip(!process.env.NEXTAUTH_SECRET, "Local auth secret required");
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { role: "admin", name: "Chart preview" }, maxAge: 300 });
  const domain = new URL(baseURL).hostname;
  await context.addCookies([{ name: "next-auth.session-token", value: token, domain, path: "/" }, { name: "__Secure-next-auth.session-token", value: token, domain, path: "/", secure: true }]);
});
async function mockData(page, { fail = false } = {}) {
  const requests = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() !== "GET") throw new Error("Chart preview must never mutate live data");
    if (url.pathname === "/api/auth/session") return route.fulfill({ json: { user: { role: "admin", name: "Chart preview" }, expires: "2099-01-01" } });
    if (url.pathname === "/api/supplier") return route.fulfill({ json: url.searchParams.has("supplierId") ? supplier : [supplier] });
    if (url.pathname === "/api/supplier/procurement") return route.fulfill({ json: records });
    if (url.pathname === "/api/analytics/procurements") {
      requests.push(url.searchParams);
      if (fail && requests.length === 1) return route.fulfill({ status: 503, json: { error: "Unavailable" } });
      const included = (!url.searchParams.get("startDate") || url.searchParams.get("startDate") <= today) && (!url.searchParams.get("endDate") || url.searchParams.get("endDate") >= today);
      return route.fulfill({ json: { daily: included ? [{ date: today, milk: 40, amount: 1900, paid: 1500, due: 400, fatMilk: 190, snfMilk: 350, avgFat: 4.75, avgSnf: 8.75 }] : [], overall: included ? { totalMilk: 40, totalAmount: 1900, totalRecords: 2, paidAmount: 1500, dueAmount: 400 } : {} } });
    }
    return route.fulfill({ json: [] });
  });
  return requests;
}

for (const [path, name] of [["/supplier/analytics", "analytics"], ["/supplier", "directory"], ["/supplier/procurement?supplierId=chart-supplier", "supplier-detail"]]) {
  test(`${name} charts match dashboard, show weighted quality, and fit mobile`, async ({ page }) => {
    await mockData(page); await page.goto(path);
    const trend = page.getByRole("region", { name: "Milk collections", exact: true });
    await expect(trend.getByTestId("supplier-trend-chart").locator("svg").first()).toBeVisible();
    await expect(page.getByRole("region", { name: "Paid & due", exact: true }).getByTestId("supplier-payments-chart").locator("svg").first()).toBeVisible();
    await page.getByRole("button", { name: "Quality", exact: true }).click();
    await expect(page.getByRole("heading", { name: "FAT & SNF", exact: true })).toBeVisible();
    await page.getByText("View collection chart data", { exact: true }).click();
    const table = page.getByRole("table", { name: "Collections and quantity-weighted quality for the selected period" });
    await expect(table.getByRole("cell", { name: "4.75", exact: true })).toBeVisible();
    await expect(table.getByRole("cell", { name: "8.75", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Value", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Procurement value", exact: true })).toBeVisible();
    await page.getByText("View collection chart data", { exact: true }).click();
    const cards = page.getByRole("region", { name: "Procurement value", exact: true }).locator("..");
    await page.evaluate(() => document.activeElement?.blur());
    await page.mouse.move(0, 0);
    await cards.screenshot({ path: `test-results/supplier-charts-${name}-desktop.png`, style: "header { visibility: hidden !important; }" });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await cards.screenshot({ path: `test-results/supplier-charts-${name}-mobile.png`, style: "header { visibility: hidden !important; }" });
  });
}
test("analytics retries a failed fetch and uses date filters for charts and totals", async ({ page }) => {
  const requests = await mockData(page, { fail: true }); await page.goto("/supplier/analytics");
  await page.getByRole("button", { name: "Retry charts" }).first().click();
  await expect(page.getByRole("heading", { name: "Milk collections", exact: true })).toBeVisible();
  await expect(page.getByTestId("supplier-trend-chart")).toBeVisible();
  await page.getByLabel("From Date", { exact: true }).fill(today);
  await expect.poll(() => requests.at(-1)?.get("startDate")).toBe(today);
  await page.getByLabel("To Date", { exact: true }).fill("2020-01-01");
  await expect(page.getByText("From date must be before the to date.").first()).toBeVisible();
  await expect(page.getByTestId("supplier-trend-chart")).toHaveCount(0);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByTestId("supplier-trend-chart")).toBeVisible();
});
