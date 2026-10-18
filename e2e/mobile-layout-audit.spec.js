import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { encode } from "next-auth/jwt";

const supplierName = "GreenValleyDairyFarmersCooperativeCollectionSociety";
const supplier = { _id: "mobile-supplier", supplierName, supplierType: "Farmer", supplierTSRate: 300, supplierNumber: "9876543210", supplierAddress: "12 Market Road, Erode" };
const date = new Date().toLocaleDateString("en-CA");

test.beforeEach(async ({ context, baseURL, page }) => {
  loadEnvConfig(process.cwd(), true);
  test.skip(!process.env.NEXTAUTH_SECRET, "Local auth secret required");
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { role: "admin", name: "Mobile preview" }, maxAge: 300 });
  await context.addCookies([{ name: "__Secure-next-auth.session-token", value: token, domain: new URL(baseURL).hostname, path: "/", secure: true }]);
  await page.route("**/api/**", async route => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() !== "GET") throw new Error("Mobile layout previews never mutate data");
    if (url.pathname === "/api/auth/session") return route.fulfill({ json: { user: { role: "admin" }, expires: "2099-01-01" } });
    if (url.pathname === "/api/supplier") return route.fulfill({ json: url.searchParams.has("supplierId") ? supplier : [supplier] });
    if (url.pathname.startsWith("/api/supplier/procurement")) return route.fulfill({ json: [{ _id: "mobile-record", supplierId: supplier._id, supplierName, date, time: "AM", milkQuantity: 25.5, fatPercentage: 3.5, snfPercentage: 8.5, rate: 36, supplierTSRate: 300, totalAmount: 918, paymentRecord: true, paymentStatus: "Not Paid" }] });
    if (url.pathname === "/api/customer") return route.fulfill({ json: [{ _id: "mobile-customer", customerName: "LongCustomerDairyWholesaleDistributionCompany", customerType: "Shop", customerNumber: "9876543210", customerAddress: "Erode", milkPrice: 50, butterPrice: 200, curdPrice: 40, gheePrice: 600 }] });
    if (url.pathname === "/api/stock/balance") return route.fulfill({ json: { butter: 12, cream: 0, curd: 60, ghee: 8, soft_paneer: -2, premium_paneer: 15 } });
    if (url.pathname === "/api/stock/thresholds") return route.fulfill({ json: { thresholds: { butter: 20, cream: 10, curd: 10, ghee: 5 } } });
    if (url.pathname === "/api/stock/ledger") return route.fulfill({ json: [] });
    return route.fulfill({ json: [] });
  });
});

async function expectContained(page) {
  const overflow = await page.evaluate(() => {
    const root = document.querySelector("main");
    return [...root.querySelectorAll("*")].filter(element => {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0 || getComputedStyle(element).position === "fixed") return false;
      let parent = element.parentElement;
      while (parent && parent !== root) {
        if (["auto", "scroll"].includes(getComputedStyle(parent).overflowX) || parent.classList.contains("recharts-wrapper")) return false;
        parent = parent.parentElement;
      }
      return rect.right > innerWidth + 1 || rect.left < -1;
    }).map(element => ({ tag: element.tagName, class: element.className, text: element.textContent.slice(0, 70), right: Math.round(element.getBoundingClientRect().right) }));
  });
  expect(overflow).toEqual([]);
}

for (const width of [320, 390]) {
  test(`stock cards and controls stay within mobile viewport at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/stock");
    await expect(page.getByRole("article", { name: "Butter inventory" })).toBeVisible();
    await expectContained(page);
    await page.getByRole("button", { name: /^(Minimum|Min) levels$/ }).click();
    await expect(page.getByLabel("Butter (kg)", { exact: true })).toBeVisible();
    await expectContained(page);
  });

  test(`supplier and customer create and edit forms fit mobile viewport at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/supplier");
    await expect(page.getByRole("link", { name: supplierName, exact: true })).toBeVisible();
    await expectContained(page);
    await page.getByRole("button", { name: "Create new supplier", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Create New Supplier", exact: true })).toBeVisible();
    await expectContained(page);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("row").filter({ hasText: supplierName }).getByTitle("Actions").click();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Edit Supplier", exact: true })).toBeVisible();
    await expectContained(page);
    await page.goto("/customer");
    await page.getByRole("button", { name: "Create new customer", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Create New Customer", exact: true })).toBeVisible();
    await expectContained(page);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("row").filter({ hasText: "LongCustomerDairyWholesaleDistributionCompany" }).getByTitle("Actions").click();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Edit Customer", exact: true })).toBeVisible();
    await expectContained(page);
    if (width === 320) await page.locator("[data-entry-form]").screenshot({ path: "test-results/mobile-layout-audit/customer-edit-320.png" });
  });

  test(`procurement detail and history supplier picker fit mobile viewport at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/supplier/procurement?supplierId=${supplier._id}`);
    await expect(page.getByRole("heading", { name: supplierName, exact: true })).toBeVisible();
    await expectContained(page);
    await page.goto("/supplier/procurement/history");
    await expect(page.getByRole("table", { name: "All procurement history" })).toBeVisible();
    await expectContained(page);
    await page.getByRole("button", { name: /Add Procurement/ }).click();
    await page.getByRole("button", { name: new RegExp(supplierName) }).click();
    await expect(page.getByLabel("Milk Quantity (L)", { exact: true })).toBeVisible();
    await expectContained(page);
    const inputSizes = await page.locator("[data-entry-form] input, [data-entry-form] select").evaluateAll(elements => elements.map(element => parseFloat(getComputedStyle(element).fontSize)));
    expect(inputSizes.length).toBeGreaterThan(0);
    expect(inputSizes.every(size => size >= 16)).toBe(true);
    if (width === 320) await page.locator("[data-entry-form]").screenshot({ path: "test-results/mobile-layout-audit/procurement-entry-320.png" });
  });
}
