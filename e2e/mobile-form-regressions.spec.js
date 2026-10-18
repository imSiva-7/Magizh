import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { encode } from "next-auth/jwt";

const id = "aaaaaaaaaaaaaaaaaaaaaaaa";
const customer = { _id: id, customerName: "Corner Shop " + "LongName".repeat(12), customerType: "Retail", customerNumber: "9876543210", milkPrice: 40, gheePrice: 500 };
const supplier = { _id: id, supplierName: "Hill Farm", supplierType: "Society", supplierTSRate: 300 };

async function setup(page, context, baseURL) {
  loadEnvConfig(process.cwd(), true);
  test.skip(!process.env.NEXTAUTH_SECRET, "Local auth secret required");
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { role: "admin", name: "Form audit" }, maxAge: 600 });
  const domain = new URL(baseURL).hostname;
  await context.addCookies(["next-auth.session-token", "__Secure-next-auth.session-token"].map(name => ({ name, value: token, domain, path: "/", secure: name.startsWith("__Secure") })));
  await page.route("**/api/**", route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    if (request.method() !== "GET") throw new Error("Unmocked mutation forbidden during form audit");
    let json = [];
    if (path === "/api/auth/session") json = { user: { role: "admin", email: "preview@example.test" }, expires: "2099-01-01" };
    if (path === "/api/customer") json = url.searchParams.has("customerId") ? customer : [customer];
    if (path === "/api/customer/order/history") json = { orders: [], summary: {} };
    if (path === "/api/customer/payment-summary") json = { customers: [] };
    if (path === "/api/customer/total_orders") json = { totalOrders: 1, totalAmount: 1000, paidAmount: 100, dueAmount: 900 };
    if (path === "/api/customer/ledger") json = { payments: [] };
    if (path === "/api/supplier") json = [supplier];
    return route.fulfill({ json });
  });
}

for (const [width, height] of [[320, 568], [390, 844], [568, 320], [844, 390]]) {
  test(`history order, detail form, and payment controls fit ${width}x${height}`, async ({ page, context, baseURL }) => {
    await setup(page, context, baseURL);
    await page.setViewportSize({ width, height });
    await page.goto("/customer/order/history?entry=order");
    if (!await page.getByRole("region", { name: "New order", exact: true }).count()) await page.getByRole("button", { name: "New order", exact: true }).click();
    const form = page.getByRole("region", { name: "New order", exact: true });
    await form.getByRole("button", { name: /Corner Shop/ }).click();
    await form.getByLabel("Milk quantity (L)").fill("2.5");
    expect(await form.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    const save = form.getByRole("button", { name: "Create Order", exact: true });
    await save.scrollIntoViewIfNeeded();
    await expect(save).toBeInViewport();
    await page.keyboard.press("Escape");
    await expect(form).toHaveCount(0);
    await page.goto(`/customer/order?customerId=${id}`);
    await expect(page.getByLabel("Milk", { exact: true })).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const launcher = page.getByRole("button", { name: "Record payment", exact: true });
    await launcher.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Amount received (₹)")).toBeFocused();
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    const clipped = await dialog.locator("input,select,button").evaluateAll(els => els.filter(el => el.getClientRects().length && el.getBoundingClientRect().right > el.closest("dialog").getBoundingClientRect().right).map(el => el.outerHTML));
    expect(clipped).toEqual([]);
    await dialog.getByRole("button", { name: "Save payment", exact: true }).scrollIntoViewIfNeeded();
    await expect(dialog.getByRole("button", { name: "Save payment", exact: true })).toBeInViewport();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(launcher).toBeFocused();
  });
}

test("closing and reopening payment dialog discards a previous history request", async ({ page, context, baseURL }) => {
  await setup(page, context, baseURL);
  await page.goto(`/customer/order?customerId=${id}`);
  const launcher = page.getByRole("button", { name: "Record payment", exact: true });
  await launcher.click();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let requested;
  const started = new Promise(resolve => { requested = resolve; });
  let completed;
  const finished = new Promise(resolve => { completed = resolve; });
  let historyRequests = 0;
  await page.route("**/api/customer/ledger?**", async route => {
    if (++historyRequests > 1) return route.fulfill({ json: { payments: [] } });
    requested(); await gate;
    await route.fulfill({ json: { payments: [{ paymentId: "old", date: "2026-10-18T06:00:00Z", amount: 100, newBalance: 100, newDue: 900, note: "Previous request receipt" }] } }).catch(() => {});
    completed();
  });
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "View payment history", exact: true }).click();
  await started;
  await dialog.getByRole("button", { name: "Close payment dialog", exact: true }).click();
  await launcher.click();
  await expect(dialog.getByRole("button", { name: "View payment history", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "View payment history", exact: true }).click();
  await expect(dialog.getByText("No payments recorded yet.", { exact: true })).toBeVisible();
  release();
  await finished;
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(dialog.getByRole("table")).toHaveCount(0);
  await expect(dialog.getByText("No payments recorded yet.", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Previous request receipt", { exact: true })).toHaveCount(0);
});

test("procurement save is single and cannot be closed or edited while pending", async ({ page, context, baseURL }) => {
  await setup(page, context, baseURL);
  await page.setViewportSize({ width: 320, height: 568 });
  const writes = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route("**/api/supplier/procurement", async route => {
    if (route.request().method() === "GET") return route.fallback();
    writes.push(route.request().postDataJSON());
    await gate;
    return route.fulfill({ status: 201, json: { success: true } });
  });
  await page.goto("/supplier/procurement/history");
  await page.getByRole("button", { name: /Add Procurement/ }).click();
  await page.getByRole("button", { name: /Hill Farm/ }).click();
  await page.getByRole("textbox", { name: "Comment", exact: true }).fill("Mobile audit");
  await page.getByRole("spinbutton", { name: "Milk Quantity (L)", exact: true }).fill("20");
  await page.getByRole("spinbutton", { name: "Fat %", exact: true }).fill("3.5");
  await page.getByRole("spinbutton", { name: "SNF %", exact: true }).fill("8.5");
  const form = page.locator("[data-procurement-form]");
  expect(await form.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await form.locator("form").evaluate(el => { el.requestSubmit(); el.requestSubmit(); });
  try {
    await expect(page.getByRole("button", { name: "Saving...", exact: true })).toBeDisabled();
    expect.soft(writes).toHaveLength(1);
    await expect.soft(page.getByRole("button", { name: "Close", exact: true })).toBeDisabled();
    await expect.soft(page.getByRole("spinbutton", { name: "Milk Quantity (L)", exact: true })).toBeDisabled();
  } finally { release(); }
});
