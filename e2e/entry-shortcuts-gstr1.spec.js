import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { encode } from "next-auth/jwt";
import fs from "node:fs/promises";
import { buildGstr1 } from "../src/lib/gstr1.mjs";
import { buildGstr1Prefills } from "../src/lib/gstr1-prefill.mjs";

test.beforeEach(async ({ page, context, baseURL }) => {
  loadEnvConfig(process.cwd(), true);
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { role: "admin", name: "Preview" }, maxAge: 600 });
  const domain = new URL(baseURL).hostname;
  const exportOrders = [{ _id: "one", date: "2026-10-18", customerName: "Shop", gstRate: 5, totalAmount: 105, items: [{ product: "Curd", totalAmount: 105, quantity: 1 }] }];
  let exportProfile = {}, exportInvoices = [];
  await context.addCookies([{ name: "next-auth.session-token", value: token, domain, path: "/" }, { name: "__Secure-next-auth.session-token", value: token, domain, path: "/", secure: true }]);
  await page.route("**/api/**", route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === "/api/customer/order/gstr1") {
      if (request.method() === "GET") return route.fulfill({ json: { orders: exportOrders, prefills: buildGstr1Prefills(exportOrders, exportProfile, exportInvoices) } });
      if (request.method() === "POST") {
        const body = request.postDataJSON();
        const data = buildGstr1({ ...body, orders: exportOrders });
        exportProfile = { gstin: body.gstin, products: body.products, hsnDigits: body.hsnDigits, defaultPos: body.defaultPos };
        exportInvoices = Object.entries(body.invoices).map(([id, meta]) => ({ _id: id, ...meta, fingerprint: body.fingerprints[id] }));
        return route.fulfill({ json: { data, saved: true } });
      }
    }
    if (request.method() !== "GET") throw new Error("Unmocked mutation blocked");
    if (path === "/api/auth/session") return route.fulfill({ json: { user: { role: "admin" }, expires: "2099-01-01" } });
    if (path === "/api/customer/order/history") return route.fulfill({ json: { orders: [], summary: {} } });
    if (path === "/api/customer/payment-summary") return route.fulfill({ json: { customers: [] } });
    return route.fulfill({ json: [] });
  });
});

test("global shortcuts open both history forms and allow close and reopen on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/stock");
  const shortcuts = page.getByRole("navigation", { name: "Quick entries" });
  await shortcuts.getByRole("link", { name: "Add Order", exact: true }).click();
  await expect(page.getByRole("region", { name: "New order", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/customer\/order\/history$/);
  await expect(shortcuts).toBeHidden();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(shortcuts.getByRole("link", { name: "Add Procurement", exact: true })).toBeVisible();
  await expect(shortcuts.getByRole("link", { name: "Add Order", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "New order", exact: true }).click();
  await expect(page.getByRole("region", { name: "New order", exact: true })).toBeVisible();
  await expect(shortcuts).toBeHidden();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await shortcuts.getByRole("link", { name: "Add Procurement", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Add Procurement", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/supplier\/procurement\/history$/);
  await expect(shortcuts).toBeHidden();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(shortcuts.getByRole("link", { name: "Add Order", exact: true })).toBeVisible();
  await expect(shortcuts.getByRole("link", { name: "Add Procurement", exact: true })).toHaveCount(0);
  await shortcuts.getByRole("link", { name: "Add Order", exact: true }).click();
  await expect(page.getByRole("region", { name: "New order", exact: true })).toBeVisible();
  await expect(shortcuts).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/entry-shortcuts-mobile.png", fullPage: true });
});

test("shortcuts hide while another entry form is open and on detail pages", async ({ page }) => {
  await page.goto("/supplier");
  const shortcuts = page.getByRole("navigation", { name: "Quick entries" });
  await expect(shortcuts).toBeVisible();
  await page.getByRole("button", { name: "Create new supplier", exact: true }).click();
  await expect(shortcuts).toBeHidden();
  await page.goto("/customer/order");
  await expect(shortcuts).toHaveCount(0);
  await page.goto("/supplier/procurement");
  await expect(shortcuts).toHaveCount(0);
});

test("GSTR-1 review downloads JSON for the chosen month without changing orders", async ({ page }) => {
  await page.goto("/customer/order/history");
  await expect(page.getByRole("button", { name: "New order", exact: true })).toBeVisible();
  test.skip(await page.getByRole("button", { name: "Export GSTR-1 JSON", exact: true }).count() === 0, "GST export controls are intentionally hidden for now.");
  await page.getByRole("button", { name: "Export GSTR-1 JSON", exact: true }).click();
  await expect(page.getByRole("button", { name: "New order", exact: true })).toBeHidden();
  const panel = page.getByRole("region", { name: "GSTR-1 JSON export" });
  await panel.getByLabel("Return month", { exact: true }).fill("2026-10");
  await panel.getByRole("button", { name: "Load monthly orders" }).click();
  await expect(panel.getByLabel("Curd GST rate", { exact: true })).toHaveValue("5");
  await panel.getByLabel("Curd HSN", { exact: true }).fill("040310");
  await panel.getByLabel("Curd GST rate", { exact: true }).fill("5");
  await panel.getByLabel("Invoice number for one", { exact: true }).fill("MD/001");
  await panel.getByLabel("Place of supply for one", { exact: true }).fill("33");
  await panel.getByRole("checkbox").check();
  const downloading = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Download GSTR-1 JSON", exact: true }).click();
  const download = await downloading;
  const json = JSON.parse(await fs.readFile(await download.path(), "utf8"));
  expect(download.suggestedFilename()).toBe("GSTR1_33ACBFM9128J1Z4_102026.json");
  expect(json.b2cs[0]).toMatchObject({ txval: 100, camt: 2.5, samt: 2.5 });
  await expect(panel.getByRole("status")).toContainText("JSON downloaded");
  await panel.getByRole("button", { name: "Load monthly orders" }).click();
  await expect(panel.getByLabel("Curd HSN", { exact: true })).toHaveValue("040310");
  await expect(panel.getByLabel("Invoice number for one", { exact: true })).toHaveValue("MD/001");
  await expect(panel.getByLabel("Place of supply for one", { exact: true })).toHaveValue("33");
  await panel.screenshot({ path: "test-results/gstr1-export-desktop.png" });
});
