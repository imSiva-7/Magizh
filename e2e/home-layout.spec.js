import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { encode } from "next-auth/jwt";
import { getTodayDate } from "../src/lib/india-date.mjs";
import { currentGoalPeriod } from "../src/lib/monthly-goals.mjs";

async function mockOverview({ page, context, baseURL }) {
  loadEnvConfig(process.cwd(), true);
  test.skip(!process.env.NEXTAUTH_SECRET, "Local auth secret is required for protected page previews");
  const user = { role: "admin", name: "Layout preview", email: "preview@example.test" };
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET, token: user, maxAge: 300 });
  const domain = new URL(baseURL).hostname;
  await context.addCookies([
    { name: "next-auth.session-token", value: token, domain, path: "/", httpOnly: true },
    { name: "__Secure-next-auth.session-token", value: token, domain, path: "/", httpOnly: true, secure: true },
  ]);

  const date = getTodayDate();
  const goals = {
    reads: 0,
    ...currentGoalPeriod(),
    targets: { sales: null, profit: null },
    actual: { sales: 150000, procurement: 90000, profit: 60000 },
  };
  await page.route("**/api/**", (route) => {
    const { pathname } = new URL(route.request().url());
    switch (pathname) {
      case "/api/auth/session":
        return route.fulfill({ json: { user, expires: "2099-01-01" } });
      case "/api/overview/goals":
        if (route.request().method() === "PUT") {
          const { month, targets } = route.request().postDataJSON();
          expect(month).toBe(goals.month);
          goals.targets = targets;
          return route.fulfill({ json: { month, targets } });
        }
        goals.reads += 1;
        return route.fulfill({ json: goals });
      case "/api/customer/order/history":
        return route.fulfill({ json: {
          orders: [{ date, totalAmount: 1200, paymentStatus: "Paid" }],
          summary: { orderCount: 1, totalAmount: 1200, paidAmount: 1200, dueAmount: 0 },
        } });
      case "/api/customer/account-summary":
        return route.fulfill({ json: { paidAmount: 1200, dueAmount: 0, customers: [] } });
      case "/api/supplier/procurement/history":
        return route.fulfill({ json: [{ date, totalAmount: 500, milkQuantity: 10, paymentStatus: "Paid" }] });
      case "/api/stock/balance":
        return route.fulfill({ json: {} });
      default:
        return route.fulfill({ json: [] });
    }
  });
  return goals;
}

test("overview sections align with the header across viewport widths", async ({ page, context, baseURL }) => {
  await mockOverview({ page, context, baseURL });
  await page.goto("/");
  const modules = page.getByRole("navigation", { name: "Dashboard modules" });
  await expect(modules.getByRole("link")).toHaveCount(8);
  await expect(page.getByRole("region", { name: "Monthly goals" }).getByText("₹1,50,000", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Sales & procurement" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Suppliers Summary" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Customers Summary" })).toBeVisible();

  for (const width of [390, 768, 1024, 1280, 1366, 1440, 1920]) {
    await test.step(`${width}px viewport`, async () => {
      await page.setViewportSize({ width, height: 900 });
      const header = await page.locator("body > header").boundingBox();
      const sections = await page.locator("#main-content > div > :visible").evaluateAll((elements) =>
        elements.map((element) => {
          const { left, right } = element.getBoundingClientRect();
          return { left, right, name: element.className };
        })
      );

      expect(sections.length).toBeGreaterThan(0);
      for (const { left, right, name } of sections) {
        expect(Math.abs(left - header.x), `${name} left edge`).toBeLessThanOrEqual(1);
        expect(Math.abs(right - (header.x + header.width)), `${name} right edge`).toBeLessThanOrEqual(1);
      }

      const columns = await modules.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
      expect(columns).toBe(width <= 600 ? 1 : width <= 1050 ? 2 : 4);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    });
  }
});

test("monthly goals can be set, edited and persisted independently of overview date filters", async ({ page, context, baseURL }) => {
  const mock = await mockOverview({ page, context, baseURL });
  await page.goto("/");
  const goals = page.getByRole("region", { name: "Monthly goals" });
  const sales = goals.getByRole("article", { name: "Sales goal" });
  const profit = goals.getByRole("article", { name: "Profit goal" });
  await expect(sales).toContainText("₹1,50,000");
  await expect(profit).toContainText("₹60,000");
  await expect(goals).toContainText("Monthly procurement: ₹90,000");
  await expect(goals).not.toContainText("Profit =");
  await expect(goals).not.toContainText("Goals are independent of the date filter");
  await expect(sales).toContainText("No target set yet");

  await goals.getByRole("button", { name: "Set goals" }).click();
  await goals.getByLabel("Monthly sales goal (₹)").fill("200000");
  await goals.getByLabel("Monthly profit goal (₹)").fill("100000");
  await goals.getByRole("button", { name: "Save goals" }).click();
  await expect(goals).toContainText("Monthly goals saved.");
  await expect(sales.getByRole("progressbar")).toHaveAttribute("value", "75");
  await expect(profit.getByRole("progressbar")).toHaveAttribute("value", "60");
  await expect(sales).toContainText("₹50,000 to go");
  await expect(profit).toContainText("₹40,000 to go");
  await page.setViewportSize({ width: 1280, height: 1100 });
  await goals.screenshot({ path: "test-results/monthly-goals-desktop.png" });

  const reads = mock.reads;
  await Promise.all([
    page.waitForResponse(response => response.url().includes("/api/customer/order/history?")),
    page.getByRole("button", { name: "Clear", exact: true }).click(),
  ]);
  await expect(sales.getByRole("progressbar")).toHaveAttribute("value", "75");
  await expect(profit.getByRole("progressbar")).toHaveAttribute("value", "60");
  expect(mock.reads).toBe(reads);

  await page.reload();
  await expect(sales.getByRole("progressbar")).toHaveAttribute("value", "75");
  await expect(profit.getByRole("progressbar")).toHaveAttribute("value", "60");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(goals).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await goals.screenshot({ path: "test-results/monthly-goals-mobile.png" });

  await goals.getByRole("button", { name: "Edit goals" }).click();
  await expect(goals.getByLabel("Monthly sales goal (₹)")).toHaveValue("200000");
  await expect(goals.getByLabel("Monthly profit goal (₹)")).toHaveValue("100000");
  await goals.getByLabel("Monthly sales goal (₹)").fill("");
  await goals.getByLabel("Monthly profit goal (₹)").fill("50000");
  await goals.getByRole("button", { name: "Save goals" }).click();
  await expect(sales).toContainText("No target set yet");
  await expect(profit).toContainText("120%");
  await expect(profit).toContainText("Goal reached!");
  await expect(profit.getByRole("progressbar")).toHaveAttribute("value", "100");
});
