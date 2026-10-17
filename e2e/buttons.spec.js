import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { encode } from "next-auth/jwt";

for (const width of [1280, 390]) {
  test(`actions share button styles across pages at ${width}px`, async ({ page, context, baseURL }) => {
    loadEnvConfig(process.cwd(), true);
    test.skip(!process.env.NEXTAUTH_SECRET, "Local auth secret required");
    const token = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { role: "admin" }, maxAge: 300 });
    const domain = new URL(baseURL).hostname;
    await context.addCookies([{ name: "__Secure-next-auth.session-token", value: token, domain, path: "/", secure: true }]);
    await page.setViewportSize({ width, height: 844 });
    await page.route("**/api/**", route => {
      const url = new URL(route.request().url());
      if (route.request().method() !== "GET") throw new Error("Button previews must never write live data");
      let json = [];
      if (url.pathname === "/api/auth/session") json = { user: { role: "admin" }, expires: "2099-01-01" };
      if (url.pathname === "/api/customer/order/history") json = { orders: [], summary: {} };
      if (url.pathname === "/api/customer/payment-summary") json = { customers: [] };
      if (url.pathname === "/api/stock/balance") json = {};
      if (url.pathname.startsWith("/api/analytics/")) json = { daily: [], overall: {}, totals: {}, products: [], payment: [] };
      return route.fulfill({ json });
    });
    const appearance = locator => locator.evaluate(element => {
      const s = getComputedStyle(element);
      return Object.fromEntries(["minHeight", "padding", "borderRadius", "fontSize", "fontWeight", "lineHeight", "backgroundColor", "color", "borderColor"].map(key => [key, s[key]]));
    });
    let secondary, primary, dateInput;
    for (const [path, filter, add] of [
      ["/", "This Month"],
      ["/customer/order/history", "Reset", "New order"],
      ["/supplier/procurement/history", "Reset", "Add Procurement"],
      ["/customer/analytics", "Reset"],
      ["/supplier/analytics", "Reset"],
      ["/productions/analytics", "Reset"],
      ["/customer", null, "New Customer"],
      ["/supplier", null, "New Supplier"],
    ]) {
      await page.goto(path);
      if (filter) {
        const button = page.getByRole("button", { name: filter, exact: true });
        await expect(button).toBeVisible();
        const current = await appearance(button);
        secondary ??= current;
        expect(current).toEqual(secondary);
        expect(await appearance(page.getByRole("button", { name: "Clear", exact: true }))).toEqual(secondary);
        const actions = button.locator('xpath=ancestor::*[@data-filter="actions"][1]');
        const alignedRight = await actions.evaluate(element => {
          const lastButton = [...element.querySelectorAll("button")].at(-1);
          return Math.abs(element.getBoundingClientRect().right - lastButton.getBoundingClientRect().right) <= 1;
        });
        expect(alignedRight).toBe(true);
        const input = page.locator('[data-filter="card"] input[type="date"]').first();
        const inputStyle = await appearance(input);
        dateInput ??= inputStyle;
        expect(inputStyle).toEqual(dateInput);
        await expect(input).toHaveCSS("height", "44px");
        await button.focus();
        await expect(button).toBeFocused();
        await expect(button).toHaveCSS("outline-style", "solid");
        if (path.endsWith("/analytics")) {
          await expect(actions.getByRole("button")).toHaveText(["Reset", "Clear", "Today"]);
          const start = page.locator("#startDate");
          const end = page.locator("#endDate");
          const defaults = [await start.inputValue(), await end.inputValue()];
          await actions.getByRole("button", { name: "Clear", exact: true }).click();
          await expect(start).toHaveValue("");
          await expect(end).toHaveValue("");
          const todayButton = actions.getByRole("button", { name: "Today", exact: true });
          expect(await appearance(todayButton)).toEqual(secondary);
          await todayButton.click();
          await expect(start).toHaveValue(defaults[1]);
          await expect(end).toHaveValue(defaults[1]);
          await button.click();
          await expect(start).toHaveValue(defaults[0]);
          await expect(end).toHaveValue(defaults[1]);
        }
      }
      if (add) {
        const button = page.getByRole("button", { name: new RegExp(add, "i") }).first();
        await expect(button).toBeVisible();
        const current = await appearance(button);
        primary ??= current;
        expect(current).toEqual(primary);
        expect(current.minHeight).toBe("44px");
        if (path.endsWith("/history")) {
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await expect(button).toBeInViewport();
          expect(await button.evaluate(element => element.getBoundingClientRect().width)).toBeLessThan(200);
          if (path.startsWith("/supplier")) {
            await button.click();
            await expect(page.getByLabel("Search Supplier", { exact: true })).toBeFocused();
            await expect(page.getByLabel("Search Supplier", { exact: true })).toBeInViewport();
            await page.getByRole("button", { name: "Close", exact: true }).click();
            await expect(button).toBeVisible();
          }
        }
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (path.endsWith("/history")) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: `test-results/${path.startsWith("/supplier") ? "procurement" : "buttons"}-${width}.png` });
      }
      await expect(page.getByRole("button", { name: "Open menu", exact: true })).toBeVisible({ visible: width < 1100 });
    }
  });
}
