import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { encode } from "next-auth/jwt";

test.beforeEach(async ({ context, baseURL }) => {
  loadEnvConfig(process.cwd(), true);
  test.skip(!process.env.NEXTAUTH_SECRET, "Local auth secret required");
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { role: "admin", name: "Procurement preview" }, maxAge: 300 });
  const domain = new URL(baseURL).hostname;
  await context.addCookies([
    { name: "next-auth.session-token", value: token, domain, path: "/" },
    { name: "__Secure-next-auth.session-token", value: token, domain, path: "/", secure: true },
  ]);
});

const date = new Date().toLocaleDateString("en-CA");
const supplier = { _id: "child", supplierName: "Green Valley Farm", supplierType: "Farmer", supplierTSRate: 300, isChildSupplier: true, cutPercentage: 20, headSupplierName: "River Society" };
const records = [
  { _id: "record-1", supplierId: "child", supplierName: supplier.supplierName, date, time: "AM", milkQuantity: 25.5, fatPercentage: 3.5, snfPercentage: 8.5, supplierTSRate: 300, rate: 33.6, totalAmount: 856.8, paymentRecord: true, paymentStatus: "Paid" },
  { _id: "record-2", supplierId: "another", supplierName: "Hilltop Dairy", date, time: "PM", milkQuantity: 10, fatPercentage: 3.5, snfPercentage: 8.5, supplierTSRate: 300, rate: 36, totalAmount: 360, paymentRecord: true, paymentStatus: "Not Paid" },
];

async function mockProcurements(page, { head = false, fail = false } = {}) {
  const headRequests = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/auth/session") return route.fulfill({ json: { user: { role: "admin", name: "Procurement preview" }, expires: "2099-01-01" } });
    if (request.method() !== "GET") throw new Error("Read-only preview must not send mutations");
    if (url.pathname === "/api/supplier/head-entries") {
      headRequests.push(url.searchParams);
      return route.fulfill({ json: { reviewCount: 1, totals: { entries: 1, milk: 25.5, earned: 61.2, paid: 0, due: 61.2 }, entries: [{ ...records[0], procurementId: "record-1", childSupplierName: supplier.supplierName, parentTsr: 300, cutPercentage: 20, childTsr: 280, ratePerLiter: 2.4, totalAmount: 61.2, paymentReviewRequired: true, paymentStatus: "Not Paid" }] } });
    }
    if (url.pathname === "/api/supplier") {
      const detail = head ? { ...supplier, _id: "head", supplierName: "River Society", isHeadSupplier: true, isChildSupplier: false, supplierType: "Society" } : supplier;
      return route.fulfill({ json: url.searchParams.has("supplierId") ? detail : [detail] });
    }
    if (url.pathname.startsWith("/api/supplier/procurement")) return route.fulfill({ status: fail ? 503 : 200, json: fail ? { error: "Preview storage unavailable" } : records });
    return route.fulfill({ json: {} });
  });
  return headRequests;
}

test("history shows daily milk and weighted quality averages and fits desktop and mobile", async ({ page }) => {
  await mockProcurements(page);
  await page.goto("/supplier/procurement/history");
  const table = page.getByRole("table", { name: "All procurement history" });
  await expect(table.locator("tbody tr")).toHaveCount(2);
  await expect(page.getByText("Milk / day", { exact: true }).locator("..")).toContainText("35.50");
  await expect(page.getByText("Fat / SNF", { exact: true }).locator("..")).toContainText("3.5 / 8.5");
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: "test-results/procurement-history-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: "test-results/procurement-history-mobile.png", fullPage: true });
});

test("supplier detail shows child relationship and supports decimal quantities and edit cancellation", async ({ page }) => {
  await mockProcurements(page);
  await page.goto("/supplier/procurement?supplierId=child");
  await expect(page.getByRole("heading", { name: supplier.supplierName })).toBeVisible();
  await page.getByLabel("Milk Quantity (L)", { exact: true }).fill("25.5");
  await page.getByLabel("Fat %", { exact: true }).fill("3.5");
  await page.getByLabel("SNF %", { exact: true }).fill("8.5");
  await expect(page.getByLabel("Rate per Liter (₹)", { exact: true })).toHaveValue("33.60");
  expect(await page.getByLabel("Milk Quantity (L)", { exact: true }).evaluate((input) => input.validity.stepMismatch)).toBeFalsy();
  await page.getByRole("button", { name: `Actions for ${date} AM record` }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edit Record" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel edit", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Procurement Entry" })).toBeVisible();
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: "test-results/procurement-detail-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: "test-results/procurement-detail-mobile.png", fullPage: true });
});

test("head commissions use active dates and flag recovered uncertain payments", async ({ page }) => {
  const requests = await mockProcurements(page, { head: true });
  await page.goto("/supplier/procurement?supplierId=head");
  await expect(page.getByText("Review payment", { exact: true })).toBeVisible();
  await expect(page.getByText(/recovered commission needs payment review/)).toBeVisible();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect.poll(() => requests.at(-1)?.get("startDate")).toBe(date);
  expect(requests.at(-1).get("endDate")).toBe(date);
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: "test-results/procurement-head-desktop.png", fullPage: true });
});

test("history storage failure has a retry instead of a misleading empty result", async ({ page }) => {
  await mockProcurements(page, { fail: true });
  await page.goto("/supplier/procurement/history");
  await expect(page.getByRole("alert").filter({ hasText: "Preview storage unavailable" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No Records Found" })).toHaveCount(0);
});

test("history supplier picker can be used with the keyboard", async ({ page }) => {
  await mockProcurements(page);
  await page.goto("/supplier/procurement/history");
  await page.getByRole("button", { name: /Add Procurement/ }).click();
  const option = page.getByRole("button", { name: /Green Valley Farm Child/ });
  await option.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Milk Quantity (L)", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Change", exact: true })).toBeVisible();
});
