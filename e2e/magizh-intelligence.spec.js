import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { encode } from "next-auth/jwt";

async function preview({ page, context, baseURL }, { role, configured, onChat, onBriefing }) {
  loadEnvConfig(process.cwd(), true);
  test.skip(!process.env.NEXTAUTH_SECRET, "Local auth secret is required for protected page previews");
  // No database-backed user is created or used by these UI previews.
  const user = { role, name: "Intelligence preview", email: "intelligence@example.test" };
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET, token: user, maxAge: 300 });
  const domain = new URL(baseURL).hostname;
  await context.addCookies([
    { name: "next-auth.session-token", value: token, domain, path: "/", httpOnly: true },
    { name: "__Secure-next-auth.session-token", value: token, domain, path: "/", httpOnly: true, secure: true },
  ]);
  const overview = {
    commercial: { startDate: "2026-11-01", throughDate: "2026-11-24", salesINR: 150000, procurementINR: 90000 },
    stock: { asOfDate: "2026-11-24", products: [{ product: "Butter", needsAttention: true, quantity: 2 }] },
    customer: { currentCustomerDueINR: 1200 },
    tasks: [{ label: "Check stock for Butter.", href: "/stock" }],
  };
  await page.route("**/api/**", async route => {
    const { pathname, searchParams } = new URL(route.request().url());
    if (pathname === "/api/auth/session") return route.fulfill({ json: { user, expires: "2099-01-01" } });
    if (pathname === "/api/intelligence") {
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON();
        if (body.action === "briefing") {
          onBriefing?.(body);
          return route.fulfill({ json: { answer: "Butter is flagged for a stock check.", overview } });
        }
        return route.fulfill({ json: onChat(body) });
      }
      return route.fulfill({ json: { configured, ...(searchParams.has("overview") ? { overview } : {}) } });
    }
    if (pathname === "/api/overview/goals") return route.fulfill({ json: {
      month: "2026-11", startDate: "2026-11-01", throughDate: "2026-11-24",
      targets: { sales: null, profit: null }, actual: { sales: 0, procurement: 0, profit: 0 },
    } });
    if (pathname === "/api/customer/account-summary") return route.fulfill({ json: { paidAmount: 0, dueAmount: 0, customers: [] } });
    if (pathname === "/api/customer/order/history") return route.fulfill({ json: { orders: [], summary: {} } });
    if (pathname === "/api/stock/balance") return route.fulfill({ json: { butter: 2 } });
    if (pathname === "/api/stock/thresholds") return route.fulfill({ json: { thresholds: { butter: 3 } } });
    return route.fulfill({ json: [] });
  });
}

test("admin can see the record-based snapshot and tasks when AI is not configured", async ({ page, context, baseURL }) => {
  await preview({ page, context, baseURL }, { role: "admin", configured: false });
  await page.goto("/");
  const card = page.getByRole("region", { name: "Magizh Intelligence" });
  await expect(card).toContainText("₹1,50,000");
  await expect(card).toContainText("AI isn’t configured");
  await expect(card.getByRole("link", { name: "Check stock for Butter." })).toHaveAttribute("href", "/stock");
  await expect(card.getByRole("button", { name: "Generate AI briefing" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Dashboard modules" }).getByRole("link")).toHaveCount(8);
  await page.getByRole("button", { name: "Open Magizh Intelligence" }).click();
  const dialog = page.getByRole("dialog", { name: "Magizh Intelligence" });
  await expect(dialog).toContainText("AI isn’t configured");
  await expect(dialog.getByRole("textbox", { name: "Your question" })).toBeDisabled();
});

test("AI briefing is generated on request and uses the matching snapshot", async ({ page, context, baseURL }) => {
  const requests = [];
  await preview({ page, context, baseURL }, { role: "admin", configured: true, onBriefing: body => requests.push(body) });
  await page.goto("/");
  const card = page.getByRole("region", { name: "Magizh Intelligence" });
  await expect(card.getByRole("button", { name: "Generate AI briefing" })).toBeVisible();
  expect(requests).toHaveLength(0);
  await card.getByRole("button", { name: "Generate AI briefing" }).click();
  await expect(card).toContainText("Butter is flagged for a stock check.");
  expect(requests).toEqual([{ action: "briefing" }]);
});

test("employee can ask a stock question on mobile and send a follow-up", async ({ page, context, baseURL }) => {
  const requests = [];
  await preview({ page, context, baseURL }, { role: "employee", configured: true, onChat: body => {
    requests.push(body);
    return { answer: "Butter is low.", sources: [{ label: "Current stock", asOfDate: "2026-11-24" }] };
  } });
  await page.setViewportSize({ width: 390, height: 690 });
  await page.goto("/stock");
  const launcher = page.getByRole("button", { name: "Open Magizh Intelligence" });
  await launcher.click();
  const chat = page.getByRole("dialog", { name: "Magizh Intelligence" });
  await expect(chat).toBeVisible();
  await expect(chat.getByRole("button", { name: "How are sales and procurement this month?" })).toHaveCount(0);
  const firstQuestion = "Which products need a stock check?";
  await chat.getByRole("button", { name: firstQuestion }).click();
  await expect(chat).toContainText("Sources: Current stock (as of 24/11/26)");
  await chat.getByRole("textbox", { name: "Your question" }).fill("What is Butter’s minimum?");
  await chat.getByRole("button", { name: "Send" }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]).toEqual({ action: "chat", question: "What is Butter’s minimum?", history: [firstQuestion] });
  expect(await chat.evaluate(node => node.getBoundingClientRect().width <= innerWidth)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(chat).toHaveCount(0);
  await expect(launcher).toBeFocused();
  await page.goto("/productions");
  await expect(page.locator("[data-entry-form]")).toBeVisible();
  await expect(launcher).toBeVisible();
});

test("chat launcher stays off the sign-in page", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Open Magizh Intelligence" })).toHaveCount(0);
});
