import { test, expect } from "@playwright/test";

test("home links remain visible during loading and errors on desktop and mobile", async ({ page }) => {
  let releaseResponse;
  const responseGate = new Promise((resolve) => { releaseResponse = resolve; });
  await page.route("**/api/customer/order/history?*", async (route) => {
    await responseGate;
    await route.fulfill({ status: 500, json: { error: "Unavailable" } });
  });
  await page.route("**/api/supplier/procurement/history?*", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/production/history?*", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/stock/balance", (route) => route.fulfill({ json: {} }));
  await page.goto("/");
  const modules = page.getByRole("navigation", { name: "Dashboard modules" });
  await expect(page.getByRole("status")).toContainText("Preparing your overview");
  await expect(modules.getByRole("link")).toHaveCount(8);
  await expect(modules.getByRole("link").first()).toBeVisible();
  releaseResponse();
  await expect(page.getByRole("alert")).toContainText("Overview unavailable");
  await expect(modules.getByRole("link").first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(modules).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});
