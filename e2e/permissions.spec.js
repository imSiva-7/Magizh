import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { encode } from "next-auth/jwt";

for (const role of ["employee", "dev"]) {
  test(`${role} can record payments but cannot correct payments or stock`, async ({ page, context, baseURL }) => {
    loadEnvConfig(process.cwd(), true);
    test.skip(!process.env.NEXTAUTH_SECRET, "Local auth secret required");
    const token = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { role, name: "Permission preview" }, maxAge: 300 });
    const domain = new URL(baseURL).hostname;
    await context.addCookies([{ name: "next-auth.session-token", value: token, domain, path: "/" }, { name: "__Secure-next-auth.session-token", value: token, domain, path: "/", secure: true }]);
    const id = "aaaaaaaaaaaaaaaaaaaaaaaa";
    await page.route("**/api/**", async route => {
      if (route.request().method() !== "GET") throw new Error("Permission previews must not write live data");
      const url = new URL(route.request().url());
      const path = url.pathname;
      if (path === "/api/auth/session") return route.fulfill({ json: { user: { role, name: "Permission preview" }, expires: "2099-01-01" } });
      if (path === "/api/customer") return route.fulfill({ json: { _id: id, customerName: "Permission Shop", customerType: "Retail" } });
      if (path === "/api/customer/order") return route.fulfill({ json: [{ _id: "bbbbbbbbbbbbbbbbbbbbbbbb", customerId: id, date: "2026-10-17", totalAmount: 1000, items: [], comment: "Existing entry" }] });
      if (path === "/api/customer/total_orders") return route.fulfill({ json: { totalOrders: 1, totalAmount: 1000, paidAmount: 300, dueAmount: 700 } });
      if (path === "/api/stock/balance") return route.fulfill({ json: { butter: 10 } });
      if (path === "/api/stock/thresholds") return route.fulfill({ json: { thresholds: { butter: 5 } } });
      return route.fulfill({ json: [] });
    });
    await page.goto(`/customer/order?customerId=${id}`);
    await page.getByRole("button", { name: "Record payment", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Amount received (₹)")).toBeEditable();
    await expect(dialog.getByLabel("Entry type").locator("option")).toHaveCount(1);
    await expect(dialog.getByRole("option", { name: "Payment correction" })).toHaveCount(0);
    await page.goto("/stock");
    await expect(page.getByRole("button", { name: "Minimum levels", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "+ Adjust stock", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Adjust Butter", exact: true })).toBeDisabled();
  });
}
