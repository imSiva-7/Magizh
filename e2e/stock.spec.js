import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { encode } from "next-auth/jwt";

test.beforeEach(async ({ context, baseURL }) => {
  loadEnvConfig(process.cwd(), true);
  test.skip(!process.env.NEXTAUTH_SECRET, "Local auth secret required");
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { role: "admin", name: "Stock preview" }, maxAge: 300 });
  const domain = new URL(baseURL).hostname;
  await context.addCookies([
    { name: "next-auth.session-token", value: token, domain, path: "/" },
    { name: "__Secure-next-auth.session-token", value: token, domain, path: "/", secure: true },
  ]);
});

async function mockStock(page, { failBalance = false, failExtras = false, balanceGate } = {}) {
  const balance = { butter: "12", cream: 0, curd: 60, ghee: 8, soft_paneer: -2, premium_paneer: 15, milk: 20 };
  let thresholds = { butter: 20, cream: 10, curd: 10, ghee: 5 };
  const adjustments = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/auth/session") return route.fulfill({ json: { user: { role: "admin", name: "Stock preview" }, expires: "2099-01-01" } });
    if (path === "/api/stock/balance") {
      if (balanceGate) await balanceGate;
      return route.fulfill({ status: failBalance ? 500 : 200, json: failBalance ? { error: "Offline" } : balance });
    }
    if (path === "/api/stock/adjust") {
      const entry = request.postDataJSON();
      adjustments.push(entry);
      balance[entry.product] = Number(balance[entry.product]) + entry.quantity;
      return route.fulfill({ json: { success: true } });
    }
    if (failExtras) return route.fulfill({ status: 500, json: { error: "Offline" } });
    if (path === "/api/stock/thresholds") {
      if (request.method() === "PUT") { thresholds = request.postDataJSON().thresholds; return route.fulfill({ json: { success: true } }); }
      return route.fulfill({ json: { thresholds } });
    }
    if (path === "/api/customer") return route.fulfill({ json: [{ butterPrice: "100", curdPrice: 10, gheePrice: 400, softPaneerPrice: 200, premiumPaneerPrice: 250 }, { butterPrice: "200" }] });
    if (path === "/api/stock/ledger") return route.fulfill({ json: [{ _id: "preview-entry", date: "2026-10-15", product: "butter", quantity: -1.25, type: "adjustment", comment: "Preview correction" }] });
    return route.fulfill({ json: {} });
  });
  return adjustments;
}

test("stock overview has correct values, clear statuses, and charts with separate units", async ({ page }) => {
  await mockStock(page);
  await page.goto("/stock");
  const butter = page.getByRole("article", { name: "Butter inventory" });
  await expect(butter).toContainText("₹150");
  await expect(butter).toContainText("₹1,800");
  await expect(butter).toContainText("Low stock");
  await expect(page.getByRole("article", { name: "Fresh Cream inventory" })).toContainText("Out of stock");
  await expect(page.getByRole("article", { name: "Soft Paneer inventory" })).toContainText("Negative stock");
  await page.getByRole("button", { name: "Needs attention (3)" }).click();
  await expect(page.getByRole("article")).toHaveCount(3);
  await page.getByRole("button", { name: "All products", exact: true }).click();
  const levels = page.getByRole("region", { name: "Stock & minimum levels" });
  await levels.getByRole("button", { name: "L", exact: true }).click();
  await expect(levels.getByText("Ghee", { exact: true })).toBeVisible();
  await expect(levels.getByText("Butter", { exact: true })).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "test-results/stock-redesign-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "test-results/stock-redesign-mobile.png", fullPage: true });
});

test("minimum level edits stay as drafts until saved and cancel discards them", async ({ page }) => {
  await mockStock(page);
  await page.goto("/stock");
  const butter = page.getByRole("article", { name: "Butter inventory" });
  await expect(butter).toContainText("Minimum 20.00 kg");
  await page.getByRole("button", { name: "Minimum levels", exact: true }).click();
  await page.getByLabel("Butter (kg)", { exact: true }).fill("4");
  await expect(butter).toContainText("Minimum 20.00 kg");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(butter).toContainText("Low stock");
  await page.getByRole("button", { name: "Minimum levels", exact: true }).click();
  await expect(page.getByLabel("Butter (kg)", { exact: true })).toHaveValue("20");
  await page.getByLabel("Butter (kg)", { exact: true }).fill("4.5");
  await page.getByRole("button", { name: "Save minimum levels" }).click();
  await expect(butter).toContainText("Minimum 4.50 kg");
  await expect(butter).toContainText("Healthy");
});

test("a decimal removal shows the resulting balance and submits only once", async ({ page }) => {
  const adjustments = await mockStock(page);
  await page.goto("/stock");
  await page.getByRole("button", { name: "Adjust Butter", exact: true }).click();
  await page.getByLabel("Action", { exact: true }).selectOption("remove");
  await page.getByLabel("Quantity (kg)", { exact: true }).fill("1.25");
  await page.getByLabel("Reason (optional)").fill("Stock loss");
  await expect(page.getByText("After adjustment", { exact: false })).toContainText("10.75 kg");
  await page.getByRole("button", { name: "Save adjustment", exact: true }).evaluate((button) => { button.click(); button.click(); });
  await expect(page.getByRole("article", { name: "Butter inventory" })).toContainText("10.75");
  expect(adjustments).toEqual([{ product: "butter", quantity: -1.25, comment: "Stock loss" }]);
});

test("optional data failures do not appear as zero prices or healthy stock", async ({ page }) => {
  await mockStock(page, { failExtras: true });
  await page.goto("/stock");
  await expect(page.getByRole("article", { name: "Butter inventory" })).toContainText("Minimum unavailable");
  await expect(page.getByRole("article", { name: "Butter inventory" })).toContainText("Not priced");
  await expect(page.getByRole("status")).toContainText("customer prices");
  await expect(page.getByRole("button", { name: "Minimum levels", exact: true })).toBeDisabled();
});

test("failed balance requests show a retry instead of a false empty inventory", async ({ page }) => {
  await mockStock(page, { failBalance: true });
  await page.goto("/stock");
  await expect(page.getByRole("alert").filter({ hasText: "Could not load stock balances" })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "+ Adjust stock", exact: true })).toBeDisabled();
});

test("slow stock requests show card placeholders and refresh retains loaded inventory", async ({ page }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await mockStock(page, { balanceGate: gate });
  await page.goto("/stock");
  const loading = page.getByTestId("stock-loading");
  await expect(loading).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Loading inventory…");
  await expect(page.getByTestId("stock-product-skeleton")).toHaveCount(7);
  await expect(page.getByRole("button", { name: "+ Adjust stock", exact: true })).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: "test-results/stock-loading-mobile.png", fullPage: true });
  release();
  await expect(loading).toHaveCount(0);
  const butter = page.getByRole("article", { name: "Butter inventory" });
  await expect(butter).toContainText("12.00");
  let releaseRefresh;
  const refreshGate = new Promise(resolve => { releaseRefresh = resolve; });
  await page.route("**/api/stock/balance", async route => { await refreshGate; await route.fulfill({ json: { butter: 14 } }); });
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Updating inventory…");
  await expect(butter).toContainText("12.00");
  await expect(loading).toHaveCount(0);
  releaseRefresh();
  await expect(butter).toContainText("14.00");
});
