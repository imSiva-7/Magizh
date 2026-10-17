import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { encode } from "next-auth/jwt";

const id = "aaaaaaaaaaaaaaaaaaaaaaaa";
const date = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const customer = { _id: id, customerName: "Green Valley Restaurant", customerNumber: "9876543210", customerType: "Restaurant", milkPrice: 40 };
const supplier = { _id: id, supplierName: "Green Valley Society", supplierNumber: "9876543210", supplierType: "Society", supplierTSRate: 300 };
const order = { _id: "order", customerId: id, customerName: customer.customerName, customerType: customer.customerType, date, totalAmount: 400, items: [{ product: "Milk", quantity: 10, ratePerUnit: 40, totalAmount: 400 }], paymentStatus: "Not Paid" };
const procurement = { _id: "procurement", supplierId: id, supplierName: supplier.supplierName, date, time: "AM", milkQuantity: 10, fatPercentage: 3.5, snfPercentage: 8.5, supplierTSRate: 300, rate: 36, totalAmount: 360, paymentStatus: "Not Paid" };

test.beforeEach(async ({ context, page, baseURL }) => {
  loadEnvConfig(process.cwd(), true);
  test.skip(!process.env.NEXTAUTH_SECRET, "Local auth secret required");
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { role: "admin", name: "Mobile preview" }, maxAge: 300 });
  const domain = new URL(baseURL).hostname;
  await context.addCookies([{ name: "next-auth.session-token", value: token, domain, path: "/" }, { name: "__Secure-next-auth.session-token", value: token, domain, path: "/", secure: true }]);
  await page.route("**/api/**", route => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() !== "GET") throw new Error("Mobile previews never write live data");
    const path = url.pathname;
    let json = [];
    if (path === "/api/auth/session") json = { user: { id: "owner", role: "admin", name: "Mobile preview" }, expires: "2099-01-01" };
    if (path === "/api/customer") json = url.searchParams.has("customerId") ? customer : [customer];
    if (path === "/api/customer/order") json = [order];
    if (path === "/api/customer/order/history") json = { orders: [order], summary: { orderCount: 1, totalAmount: 400 } };
    if (path === "/api/customer/payment-summary") json = { customers: [{ customerId: id, totalOrders: 1, totalAmount: 400, receivedAmount: 100, receiptCount: 1, salesDaily: [{ date, totalAmount: 400, totalOrders: 1 }], receiptsDaily: [{ date, receivedAmount: 100 }] }] };
    if (path === "/api/customer/total_orders") json = { totalOrders: 1, totalAmount: 400, paidAmount: 100, dueAmount: 300 };
    if (path === "/api/customer/ledger") json = { payments: [] };
    if (path === "/api/supplier") json = url.searchParams.has("supplierId") ? supplier : [supplier];
    if (path.startsWith("/api/supplier/procurement")) json = [procurement];
    if (path === "/api/employee") json = [{ _id: id, empID: "EMP001", name: "Mobile Test Employee", employeeName: "Mobile Test Employee", gender: "Male", salary: 15000 }];
    if (path === "/api/attendance/history") json = { records: [{ date, empID: "EMP001", name: "Mobile Test Employee", checkIn: "08:00", checkOut: "17:00", hoursWorked: 9 }], summary: { uniqueEmployees: 1, totalHours: 9, incompleteCount: 0 } };
    if (path === "/api/stock/balance") json = { butter: 10, cream: 20, curd: 50, ghee: 4, soft_paneer: 8, premium_paneer: 4 };
    if (path === "/api/stock/thresholds") json = { thresholds: {} };
    if (path === "/api/admin/users") json = [{ _id: id, name: "Green Valley Society", email: "supplier.operations.with.a.long.address@example.test", role: "supplier" }];
    if (path.startsWith("/api/analytics/")) json = { daily: [{ date, milk: 10, batches: 1, fat: 3.5, snf: 8.5, amount: 400, orders: 1 }], overall: { totalOrders: 1, totalAmount: 400, totalMilk: 10, totalRecords: 1, paidAmount: 100, dueAmount: 300 }, totals: { milk: 10, totalBatches: 1, avgFat: 3.5, avgSnf: 8.5 }, products: [], payment: [] };
    return route.fulfill({ json });
  });
});

for (const width of [320, 390]) {
  test(`pages and filters stay within the screen at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 640 });
    for (const path of ["/", "/customer", "/supplier", "/employee", "/productions", "/productions/history", "/stock", "/customer/payments", "/supplier/payments", "/customer/order/history", "/supplier/procurement/history", `/customer/order?customerId=${id}`, `/supplier/procurement?supplierId=${id}`, "/employee/attendance", "/employee/attendance/history", "/customer/analytics", "/supplier/analytics", "/productions/analytics", "/admin", "/register"]) {
      await test.step(path, async () => {
        await page.goto(path);
        await expect(page.locator("#main-content")).not.toContainText(/Loading (customers|suppliers|employees|orders|records|data)/i);
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth), { message: `${path} causes horizontal page scrolling` }).toBeLessThanOrEqual(width);
        const clippedFilters = await page.locator('[data-filter="card"] input:not([type="radio"]):not([type="checkbox"]), [data-filter="card"] select, [data-filter="actions"] button').evaluateAll(elements => elements.filter(el => el.getClientRects().length).filter(el => { const r = el.getBoundingClientRect(); return r.left < 0 || r.right > innerWidth + 1 || r.width < 44; }).map(el => el.outerHTML));
        expect(clippedFilters, `${path} clipped filter controls`).toEqual([]);
      });
    }
  });
}

test("small-screen procurement entry and payment controls remain reachable", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/supplier/procurement/history");
  await page.getByRole("button", { name: /Add Procurement/ }).click();
  await page.getByRole("button", { name: /Green Valley Society/ }).click();
  await page.getByLabel("Milk Quantity (L)", { exact: true }).fill("10.25");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Add Record", exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Add Record", exact: true })).toBeInViewport();
  await page.goto("/customer/order/history");
  await page.getByRole("button", { name: "New order", exact: true }).click();
  const orderDialog = page.getByRole("dialog", { name: "New order", exact: true });
  await orderDialog.getByRole("button", { name: /Green Valley Restaurant/ }).click();
  await orderDialog.getByLabel("Milk quantity (L)").fill("2.5");
  await expect(orderDialog.getByRole("button", { name: "Save order", exact: true })).toBeInViewport();
  expect(await orderDialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.goto("/customer/payments");
  await page.getByRole("button", { name: "Record payment", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount received (₹)").fill("50.25");
  const save = dialog.getByRole("button", { name: "Save payment", exact: true });
  await save.scrollIntoViewIfNeeded();
  await expect(save).toBeInViewport();
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
});

test("mobile add forms and stock editors keep their fields within the screen", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  for (const [path, add] of [["/customer", "Create new customer"], ["/supplier", "Create new supplier"], ["/employee", "Create new employee"], ["/stock", "+ Adjust stock"], ["/stock", "Minimum levels"]]) {
    await test.step(add, async () => {
      await page.goto(path);
      await page.getByRole("button", { name: add, exact: true }).click();
      const form = page.locator("main form").first();
      await expect(form).toBeVisible();
      const clippedFields = await form.locator('input:not([type="checkbox"]):not([type="radio"]), select, button').evaluateAll(elements => elements.filter(el => el.getClientRects().length).filter(el => { const r = el.getBoundingClientRect(); return r.left < 0 || r.right > innerWidth + 1; }).map(el => el.outerHTML));
      expect(clippedFields).toEqual([]);
      await form.locator('button[type="submit"]').scrollIntoViewIfNeeded();
      await expect(form.locator('button[type="submit"]')).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
});
