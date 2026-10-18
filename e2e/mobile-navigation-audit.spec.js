import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { encode } from "next-auth/jwt";

const id = "aaaaaaaaaaaaaaaaaaaaaaaa";
const customer = { _id: id, customerName: "Mobile navigation customer", customerNumber: "9876543210", customerType: "Restaurant", milkPrice: 40 };

test.use({ hasTouch: true, isMobile: true });

test.beforeEach(async ({ context, page, baseURL }) => {
  loadEnvConfig(process.cwd(), true);
  test.skip(!process.env.NEXTAUTH_SECRET, "Local auth secret required");
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { role: "admin", name: "Mobile navigation audit" }, maxAge: 600 });
  const domain = new URL(baseURL).hostname;
  await context.addCookies(["next-auth.session-token", "__Secure-next-auth.session-token"].map(name => ({ name, value: token, domain, path: "/", secure: name.startsWith("__Secure") })));
  await page.route("**/api/**", route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    if (request.method() !== "GET") throw new Error("Navigation audit must never write live data");
    let json = [];
    if (path === "/api/auth/session") json = { user: { role: "admin", name: "Mobile navigation audit" }, expires: "2099-01-01" };
    if (path === "/api/customer") json = url.searchParams.has("customerId") ? customer : [customer];
    if (path === "/api/customer/order/history") json = { orders: [], summary: {} };
    if (path === "/api/customer/payment-summary") json = { customers: [] };
    if (path === "/api/stock/balance") json = {};
    if (path === "/api/stock/thresholds") json = { thresholds: {} };
    return route.fulfill({ json });
  });
});

for (const [width, height] of [[320, 568], [390, 844], [844, 320]]) {
  test(`mobile drawer supports scrolling, focus, and shortcuts at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/stock");
    const shortcuts = page.getByRole("navigation", { name: "Quick entries" });
    await expect(shortcuts).toBeVisible();
    const launcher = page.getByRole("button", { name: "Open menu", exact: true });
    await launcher.click();
    const drawer = page.getByRole("dialog", { name: "Mobile navigation menu" });
    const close = drawer.getByRole("button", { name: "Close menu", exact: true });
    await expect(close).toBeFocused();
    await expect(shortcuts).toBeHidden();
    const signOut = drawer.getByRole("button", { name: "Sign Out", exact: true });
    await signOut.scrollIntoViewIfNeeded();
    await expect(signOut).toBeInViewport();
    expect(await signOut.evaluate(element => { const rect = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)); })).toBe(true);
    await signOut.focus();
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await expect(close).toBeInViewport();
    await page.keyboard.press("Shift+Tab");
    await expect(signOut).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect(launcher).toBeFocused();
    await expect(shortcuts).toBeVisible();
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("switching to desktop closes a mobile drawer and releases scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/stock");
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Mobile navigation menu" })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.getByRole("dialog", { name: "Mobile navigation menu" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Main navigation", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
});

test("browser Back dismisses the mobile drawer on the restored page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/stock");
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await page.getByRole("dialog", { name: "Mobile navigation menu" }).getByRole("link", { name: "Customers", exact: true }).click();
  await expect(page).toHaveURL(/\/customer$/);
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await page.goBack();
  await expect(page).toHaveURL(/\/stock$/);
  await expect(page.getByRole("dialog", { name: "Mobile navigation menu" })).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
});

test("short-screen table actions remain above the table and restore the launcher on Escape", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 320 });
  await page.goto("/customer");
  const trigger = page.locator("tbody tr").first().locator('button[class*="actionMenuButton"]');
  await trigger.click();
  const popup = page.locator("[popover]:popover-open");
  const edit = popup.getByRole("button", { name: "Edit", exact: true });
  await expect(edit).toBeFocused();
  await expect(edit).toBeInViewport();
  const bounds = await popup.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(320);
  expect(await edit.evaluate(element => { const rect = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)); })).toBe(true);
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
