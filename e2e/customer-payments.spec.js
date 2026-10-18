import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { encode } from "next-auth/jwt";

test.beforeEach(async ({ context, baseURL }) => {
  loadEnvConfig(process.cwd(), true);
  test.skip(!process.env.NEXTAUTH_SECRET, "Local auth secret required");
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { role: "admin", name: "Payment preview" }, maxAge: 300 });
  const domain = new URL(baseURL).hostname;
  await context.addCookies([{ name: "next-auth.session-token", value: token, domain, path: "/" }, { name: "__Secure-next-auth.session-token", value: token, domain, path: "/", secure: true }]);
});

async function mockPayments(page, { failOnce = false } = {}) {
  const customer = { _id: "payment-customer", customerName: "Partial Payment Shop", customerType: "Retail" };
  let paid = 0, attempts = 0;
  const receipts = [], requests = [];
  await page.route("**/api/**", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname === "/api/customer/total_orders" && request.method() === "PUT") {
      const body = request.postDataJSON(); requests.push(body); attempts++;
      const found = receipts.find(entry => entry.paymentId === body.paymentId);
      if (!found) { paid = Math.round((paid + Number(body.paidAmount)) * 100) / 100; receipts.push({ ...body, amount: Number(body.paidAmount), date: new Date().toISOString(), newBalance: paid, newDue: 1000 - paid }); }
      if (failOnce && attempts === 1) return route.fulfill({ status: 503, json: { error: "Connection interrupted" } });
      return route.fulfill({ json: { message: "Payment recorded", paidAmount: paid, dueAmount: 1000 - paid } });
    }
    if (request.method() !== "GET") throw new Error("No unmocked payment writes are allowed");
    if (url.pathname === "/api/auth/session") return route.fulfill({ json: { user: { role: "admin", name: "Preview" }, expires: "2099-01-01" } });
    if (url.pathname === "/api/customer") return route.fulfill({ json: [customer] });
    if (url.pathname === "/api/customer/total_orders") return route.fulfill({ json: url.searchParams.has("customerId") ? { _id: customer._id, totalAmount: 1000, paidAmount: paid, dueAmount: 1000 - paid, totalOrders: 1 } : [{ _id: customer._id, totalAmount: 1000, paidAmount: paid, dueAmount: 1000 - paid, totalOrders: 1 }] });
    if (url.pathname === "/api/customer/payment-summary") return route.fulfill({ json: { customers: [{ customerId: customer._id, totalOrders: 1, totalAmount: 1000, receivedAmount: paid, receiptCount: receipts.length, netChange: 1000 - paid }] } });
    if (url.pathname === "/api/customer/order/history") return route.fulfill({ json: { orders: [{ _id: "order-1", customerId: customer._id, date: "2026-10-16", totalAmount: 1000, items: [], paymentStatus: "Not Paid" }] } });
    if (url.pathname === "/api/customer/ledger") return route.fulfill({ json: { payments: [...receipts].reverse() } });
    return route.fulfill({ json: [] });
  });
  return { requests, receipts };
}

test("partial payments reduce due and overpayments become credit, with correction history", async ({ page }) => {
  await mockPayments(page);
  await page.goto("/customer/payments");
  await expect(page.getByRole("button", { name: "Mark as Paid", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Record payment", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount received (₹)").fill("300.25");
  await expect(dialog.getByRole("status")).toHaveText("Balance after this entry: ₹699.75 due");
  await dialog.getByLabel("Payment method").selectOption("UPI");
  await dialog.getByLabel("Reference (optional)").fill("UPI-123");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => dialog.evaluate(el => el.getBoundingClientRect().width <= innerWidth)).toBeTruthy();
  await dialog.screenshot({ path: "test-results/customer-partial-payment-mobile.png" });
  await dialog.getByRole("button", { name: "Save payment", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Record payment", exact: true }).click();
  await dialog.getByLabel("Amount received (₹)").fill("799.75");
  await expect(dialog.getByRole("status")).toHaveText("Balance after this entry: ₹100.00 credit");
  await dialog.getByRole("button", { name: "Save payment", exact: true }).click();
  await expect(page.getByRole("button", { name: "Record payment", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Record payment", exact: true }).click();
  await dialog.getByLabel("Entry type").selectOption("correction");
  await dialog.getByLabel("Correction amount (₹)").fill("-100");
  await dialog.getByLabel("Correction reason").fill("Duplicate cash receipt");
  await dialog.getByRole("button", { name: "Save correction", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Record payment", exact: true }).click();
  await dialog.getByRole("button", { name: "View payment history" }).click();
  await expect(dialog.getByRole("cell", { name: "Cash · Duplicate cash receipt", exact: true })).toBeVisible();
  await expect(dialog.getByRole("cell", { name: "UPI · UPI-123", exact: true })).toBeVisible();
});

test("retry after a lost response uses the same receipt ID", async ({ page }) => {
  const { requests, receipts } = await mockPayments(page, { failOnce: true });
  await page.goto("/customer/payments");
  await page.getByRole("button", { name: "Record payment", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount received (₹)").fill("300");
  await dialog.getByRole("button", { name: "Save payment", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("retry");
  await dialog.getByRole("button", { name: "Save payment", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(requests[0].paymentId).toBe(requests[1].paymentId);
  expect(receipts).toHaveLength(1);
});

for (const viewport of [{ width: 1280, height: 600 }, { width: 390, height: 640 }]) {
  test(`payment dialog scrolls with the wheel at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockPayments(page);
    await page.goto("/customer/payments");
    await page.getByRole("button", { name: "Record payment", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.evaluate(element => { element.scrollTop = 0; });
    const bounds = await dialog.boundingBox();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.wheel(0, 2000);
    await expect.poll(() => dialog.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    const save = dialog.getByRole("button", { name: "Save payment", exact: true });
    await expect(save).toBeInViewport();
    await dialog.getByRole("button", { name: "View payment history" }).click();
    await expect(dialog.getByText("No payments recorded yet.")).toBeVisible();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.wheel(0, 2000);
    await expect(dialog.getByText("No payments recorded yet.")).toBeInViewport();
    await page.mouse.wheel(0, -2000);
    await expect(dialog.getByRole("button", { name: "Close payment dialog" })).toBeInViewport();
  });
}
