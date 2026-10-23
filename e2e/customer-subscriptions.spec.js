import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { encode } from "next-auth/jwt";

for (const width of [360, 1280]) {
  test(`customer subscriptions create a priced schedule and generate orders at ${width}px`, async ({ page, context, baseURL }) => {
    loadEnvConfig(process.cwd(), true);
    test.skip(!process.env.NEXTAUTH_SECRET, "Local auth secret required");
    const token = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { role: "admin" }, maxAge: 300 });
    await context.addCookies([{ name: "__Secure-next-auth.session-token", value: token, domain: new URL(baseURL).hostname, path: "/", secure: true }]);
    await page.setViewportSize({ width, height: 844 });
    const customer = { _id: "507f1f77bcf86cd799439011", customerName: "Subscription Test", milkPrice: 50 };
    let subscriptions = [], generated = false;
    const writes = [];
    // All API traffic is mocked. This test never writes to the live database.
    await page.route("**/api/**", async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      if (path === "/api/auth/session") return route.fulfill({ json: { user: { role: "admin" }, expires: "2099-01-01" } });
      if (path === "/api/customer") return route.fulfill({ json: [customer] });
      if (path === "/api/customer/subscriptions/generate") { generated = true; return route.fulfill({ json: { created: 1, existing: 0, remaining: 0, errors: [] } }); }
      if (path === "/api/customer/subscriptions") {
        if (request.method() === "GET") return route.fulfill({ json: { subscriptions, automationConfigured: false } });
        const body = request.postDataJSON(); writes.push(body);
        if (request.method() === "POST") subscriptions = [{ ...body, _id: "507f1f77bcf86cd799439012", customerName: customer.customerName, status: "active", nextDate: body.startDate }];
        if (request.method() === "PATCH") subscriptions[0].status = body.action === "pause" ? "paused" : "active";
        return route.fulfill({ json: { message: "Saved" } });
      }
      return route.fulfill({ json: [] });
    });
    await page.goto(`/customer/subscriptions?customerId=${customer._id}`);
    await expect(page.getByRole("heading", { name: "Customer Subscriptions", exact: true })).toBeVisible();
    // The product row is the immediate parent of its product name.
    const row = page.getByText("Milk", { exact: true }).locator("..");
    await row.getByLabel("Quantity", { exact: true }).fill("2");
    await expect(row.getByLabel("Price per unit (₹)", { exact: true })).toHaveValue("50");
    await page.getByRole("combobox", { name: "GST", exact: true }).selectOption("exclusive");
    await expect(page.getByText("Per delivery:")).toContainText("₹105.00");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Create subscription", exact: true }).click();
    await expect(page.getByRole("article")).toHaveCount(1);
    expect(writes[0]).toMatchObject({ customerId: customer._id, items: [{ product: "Milk", quantity: 2, ratePerUnit: 50 }], gstType: "exclusive", affectStockValue: false });
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(page.getByRole("button", { name: "Resume", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Generate due orders", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("1 orders created");
    expect(generated).toBe(true);
    await expect(page.getByRole("navigation", { name: "Quick entries" })).toBeHidden();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `test-results/customer-subscriptions-${width}.png`, fullPage: true });
  });
}
