import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { encode } from "next-auth/jwt";

test.beforeEach(async ({ context, baseURL }) => {
  loadEnvConfig(process.cwd(), true);
  test.skip(!process.env.NEXTAUTH_SECRET, "Local auth secret required");
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { role: "admin", name: "Procurement preview" }, maxAge: 300 });
  const domain = new URL(baseURL).hostname;
  await context.addCookies([
    { name: "next-auth.session-token", value: token, domain, path: "/" },
    { name: "__Secure-next-auth.session-token", value: token, domain, path: "/", secure: true },
  ]);
});

const date = new Date().toLocaleDateString("en-CA");
const supplier = { _id: "child", supplierName: "Green Valley Farm", supplierType: "Farmer", supplierTSRate: 300, isChildSupplier: true, cutPercentage: 20, headSupplierName: "River Society" };
const records = [
  { _id: "record-1", supplierId: "child", supplierName: supplier.supplierName, date, time: "AM", milkQuantity: 25.5, fatPercentage: 3.5, snfPercentage: 8.5, supplierTSRate: 300, rate: 33.6, totalAmount: 856.8, paymentRecord: true, paymentStatus: "Paid" },
  { _id: "record-2", supplierId: "another", supplierName: "Hilltop Dairy", date, time: "PM", milkQuantity: 10, fatPercentage: 3.5, snfPercentage: 8.5, supplierTSRate: 300, rate: 36, totalAmount: 360, paymentRecord: true, paymentStatus: "Not Paid" },
];

async function mockProcurements(page, { head = false, fail = false, rows = records } = {}) {
  const headRequests = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/auth/session") return route.fulfill({ json: { user: { role: "admin", name: "Procurement preview" }, expires: "2099-01-01" } });
    if (request.method() !== "GET") throw new Error("Read-only preview must not send mutations");
    if (url.pathname === "/api/supplier/head-entries") {
      headRequests.push(url.searchParams);
      return route.fulfill({ json: { reviewCount: 1, totals: { entries: 1, milk: 25.5, earned: 61.2, paid: 0, due: 61.2 }, entries: [{ ...records[0], procurementId: "record-1", childSupplierName: supplier.supplierName, parentTsr: 300, cutPercentage: 20, childTsr: 280, ratePerLiter: 2.4, totalAmount: 61.2, paymentReviewRequired: true, paymentStatus: "Not Paid" }] } });
    }
    if (url.pathname === "/api/supplier") {
      const detail = head ? { ...supplier, _id: "head", supplierName: "River Society", isHeadSupplier: true, isChildSupplier: false, supplierType: "Society" } : supplier;
      return route.fulfill({ json: url.searchParams.has("supplierId") ? detail : [detail] });
    }
    if (url.pathname.startsWith("/api/supplier/procurement")) return route.fulfill({ status: fail ? 503 : 200, json: fail ? { error: "Preview storage unavailable" } : rows });
    return route.fulfill({ json: {} });
  });
  return headRequests;
}

const toastColors = {
  success: { background: "rgb(231, 246, 237)", border: "rgb(184, 226, 197)", icon: "rgb(50, 180, 93)" },
  info: { background: "rgb(230, 240, 251)", border: "rgb(173, 208, 243)", icon: "rgb(8, 117, 223)" },
  error: { background: "rgb(252, 236, 232)", border: "rgb(244, 191, 181)", icon: "rgb(233, 75, 53)" },
  pending: { background: "rgb(237, 245, 240)", border: "rgb(200, 223, 208)", icon: "rgb(39, 121, 93)" },
};

async function expectToastStyle(page, notification, tone) {
  const colors = toastColors[tone];
  await expect(notification).toHaveCSS("border-radius", "16px");
  await expect(notification).toHaveCSS("background-color", colors.background);
  await expect(notification).toHaveCSS("border-left-color", colors.border);
  await expect(notification).toHaveCSS("border-right-color", colors.border);
  const icon = notification.locator(".Toastify__toast-icon");
  await expect(icon).toHaveCSS("width", "42px");
  await expect(icon).toHaveCSS("height", "42px");
  await expect(icon).toHaveCSS("background-color", colors.icon);
  await expect(notification.locator(".Toastify__progress-bar--wrp")).toHaveCSS("visibility", "hidden");
  await expect(page.locator(".Toastify__toast-container").filter({ has: notification })).toHaveCSS("position", "fixed");
  await expect(page.locator(".Toastify").filter({ has: notification })).toHaveCSS("position", "fixed");
  await expect.poll(async () => {
    const header = await page.locator("body > header").boundingBox();
    const toast = await notification.boundingBox();
    return toast && header && toast.x >= header.x - 1 && toast.y >= header.y + header.height &&
      Math.abs(toast.x + toast.width - (header.x + header.width)) <= 1;
  }).toBeTruthy();
}

async function measurePageLayout(page) {
  return page.locator("#main-content").evaluate(main => {
    const measure = element => {
      const { x, y, width, height } = element.getBoundingClientRect();
      // Document-relative coordinates are independent of any ordinary scrolling.
      return [x + window.scrollX, y + window.scrollY, width, height].map(Math.round);
    };
    return {
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
      main: measure(main),
      content: Array.from(main.querySelectorAll("h1, h2, form, table"))
        .filter(element => element.getClientRects().length > 0)
        .map(measure),
    };
  });
}

test("history shows daily milk and weighted quality averages and fits desktop and mobile", async ({ page }) => {
  await mockProcurements(page);
  await page.goto("/supplier/procurement/history");
  const table = page.getByRole("table", { name: "All procurement history" });
  await expect(table.locator("tbody tr")).toHaveCount(2);
  await expect(page.getByText("Milk / day", { exact: true }).locator("..")).toContainText("35.50");
  await expect(page.getByText("Fat / SNF", { exact: true }).locator("..")).toContainText("3.50 / 8.50");
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: "test-results/procurement-history-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: "test-results/procurement-history-mobile.png", fullPage: true });
});

test("supplier detail shows child relationship and supports decimal quantities and edit cancellation", async ({ page }) => {
  await mockProcurements(page);
  await page.goto("/supplier/procurement?supplierId=child");
  await expect(page.getByRole("heading", { name: supplier.supplierName })).toBeVisible();
  await expect(page.locator('[data-category-badge="rate"]')).toHaveText("TSR: 280");
  await expect(page.locator('[data-category-badge="supplierRole"]')).toHaveText("Child supplier");
  await expect(page.getByText("Linked to River Society", { exact: true })).toBeVisible();
  const badgeSizes = await page.locator('[data-category-badge]').evaluateAll(elements => elements.map(element => ({ height: element.getBoundingClientRect().height, font: getComputedStyle(element).fontSize })));
  expect(badgeSizes).toEqual(Array(3).fill({ height: 28, font: "12px" }));
  await page.getByLabel("Milk Quantity (L)", { exact: true }).fill("25.5");
  await page.getByLabel("Fat %", { exact: true }).fill("3.5");
  await page.getByLabel("SNF %", { exact: true }).fill("8.5");
  await expect(page.getByLabel("Rate per Liter (₹)", { exact: true })).toHaveValue("33.60");
  expect(await page.getByLabel("Milk Quantity (L)", { exact: true }).evaluate((input) => input.validity.stepMismatch)).toBeFalsy();
  await page.getByRole("button", { name: `Actions for ${date} AM record` }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edit Record" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel edit", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Procurement Entry" })).toBeVisible();
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: "test-results/procurement-detail-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: "test-results/procurement-detail-mobile.png", fullPage: true });
});

test("head commissions use active dates and flag recovered uncertain payments", async ({ page }) => {
  const requests = await mockProcurements(page, { head: true });
  await page.goto("/supplier/procurement?supplierId=head");
  await expect(page.locator('[data-category-badge="supplierRole"]')).toHaveText("Head supplier");
  await expect(page.getByText("Review payment", { exact: true })).toBeVisible();
  await expect(page.getByText(/recovered commission needs payment review/)).toBeVisible();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect.poll(() => requests.at(-1)?.get("startDate")).toBe(date);
  expect(requests.at(-1).get("endDate")).toBe(date);
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: "test-results/procurement-head-desktop.png", fullPage: true });
});

for (const succeeds of [true, false]) {
  test(`delete toast responds promptly when procurement deletion ${succeeds ? "succeeds" : "fails"}`, async ({ page }) => {
    await mockProcurements(page);
    let releaseDelete;
    let releaseRefresh;
    const deleteGate = new Promise((resolve) => { releaseDelete = resolve; });
    const refreshGate = new Promise((resolve) => { releaseRefresh = resolve; });
    let deleteCount = 0;
    let deleted = false;
    let refreshStarted = false;

    await page.route("**/api/supplier/procurement?*", async (route) => {
      const request = route.request();
      if (request.method() === "DELETE") {
        expect(new URL(request.url()).searchParams.get("id")).toBe(records[0]._id);
        deleteCount += 1;
        await deleteGate;
        deleted = succeeds;
        return route.fulfill({ status: succeeds ? 200 : 500, json: succeeds ? {} : { error: "Preview delete failed" } });
      }
      if (request.method() !== "GET") throw new Error("Unexpected preview mutation");
      if (deleted) {
        refreshStarted = true;
        await refreshGate;
      }
      return route.fulfill({ json: deleted ? [] : [records[0]] });
    });

    try {
      await page.clock.install();
      await page.setViewportSize({ width: succeeds ? 1280 : 320, height: 844 });
      await page.goto("/supplier/procurement?supplierId=child");
      await page.getByRole("button", { name: `Actions for ${date} AM record` }).click();
      await page.getByRole("button", { name: "Delete", exact: true }).click();
      const notice = page.locator(".magizh-delete-toast").filter({ hasText: /Delete now takes two clicks/ });
      await expect(notice).toBeVisible();
      await expectToastStyle(page, notice, "info");
      expect(deleteCount).toBe(0);

      // The deliberate confirmation guard prevents accidental double-click deletion.
      await page.getByRole("button", { name: "Confirm", exact: true }).click({ delay: 550 });
      const undo = page.getByRole("button", { name: "Undo", exact: true });
      await expect(undo).toBeVisible();
      const message = await page.getByText("Procurement pending deletion", { exact: true }).boundingBox();
      const action = await undo.boundingBox();
      expect(message.x + message.width).toBeLessThan(action.x);
      expect(Math.abs(message.y + message.height / 2 - action.y - action.height / 2)).toBeLessThan(2);
      await expect(page.getByRole("button", { name: `Actions for ${date} AM record` })).toHaveCount(0);
      expect(deleteCount).toBe(0);
      await undo.click();
      await page.clock.fastForward(5100);
      expect(deleteCount).toBe(0);
      await page.getByRole("button", { name: `Actions for ${date} AM record` }).click();
      await page.getByRole("button", { name: "Delete", exact: true }).click();
      await page.getByRole("button", { name: "Confirm", exact: true }).click({ delay: 550 });
      await expect(undo).toBeVisible();
      await page.clock.fastForward(5100);
      const pending = page.locator(".magizh-delete-toast").filter({ hasText: "Deleting record…" });
      await expect(pending).toBeVisible();
      await expect.poll(() => deleteCount).toBe(1);
      const toastId = await pending.getAttribute("id");
      await expect(page.getByText("Deleted successfully", { exact: true })).toHaveCount(0);
      await page.setViewportSize({ width: succeeds ? 1920 : 390, height: 844 });
      await expectToastStyle(page, pending, "pending");
      await expect(pending.getByRole("button", { name: "close" })).toHaveCount(0);
      await page.screenshot({ path: `test-results/toast-${succeeds ? "desktop" : "mobile"}-pending.png` });

      releaseDelete();
      const result = page.locator(".magizh-delete-toast").filter({ hasText: succeeds ? "Deleted successfully" : "Preview delete failed" });
      await expect(result).toBeVisible();
      await expect(result).toHaveAttribute("id", toastId);
      await expect(pending).toHaveCount(0);
      await expectToastStyle(page, result, succeeds ? "success" : "error");
      await expect(result.getByRole("button", { name: "close" })).toHaveCSS("width", succeeds ? "36px" : "40px");
      await page.screenshot({ path: `test-results/toast-${succeeds ? "desktop-success" : "mobile-error"}.png` });
      await result.screenshot({ path: `test-results/toast-${succeeds ? "desktop-success" : "mobile-error"}-card.png` });

      if (succeeds) {
        // The success toast must already be visible while the table refresh is blocked.
        await expect.poll(() => refreshStarted).toBe(true);
        releaseRefresh();
      } else {
        await expect(page.getByRole("button", { name: `Actions for ${date} AM record` })).toBeVisible();
        expect(refreshStarted).toBe(false);
      }
    } finally {
      releaseDelete();
      releaseRefresh();
    }
  });
}

for (const width of [1280, 390]) {
  test(`toast overlays the page without changing content layout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    // Isolate geometry from the entrance animations on the procurement page itself.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await mockProcurements(page);
    await page.goto("/supplier/procurement?supplierId=child");
    await expect(page.getByRole("heading", { name: supplier.supplierName })).toBeVisible();
    await expect(page.getByRole("table", { name: "Procurement history" })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    // Resetting already-default filters emits a real informational toast but does not
    // change the displayed records or make a mutation request.
    const reset = page.getByRole("button", { name: "Reset", exact: true });
    await reset.scrollIntoViewIfNeeded();
    const before = await measurePageLayout(page);
    expect(before.content.length).toBeGreaterThan(3);
    await reset.click();

    const notification = page.locator(".Toastify__toast").filter({ hasText: "Date filters reset to default." });
    await expect(notification).toBeVisible();
    await expectToastStyle(page, notification, "info");
    expect(await measurePageLayout(page)).toEqual(before);
    const close = notification.getByRole("button", { name: "close" });
    await expect(close).toHaveCSS("width", width === 390 ? "40px" : "36px");
    await close.click();
    await expect(notification).toBeHidden();
    expect(await measurePageLayout(page)).toEqual(before);
  });
}

test("reduced motion preserves the toast auto-dismiss duration", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockProcurements(page);
  await page.goto("/supplier/procurement?supplierId=child");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await page.mouse.move(0, 0);
  const notification = page.locator(".Toastify__toast").filter({ hasText: "Date filters reset to default." });
  await expect(notification).toBeVisible();
  await expect(notification.locator(".Toastify__progress-bar--animated")).toHaveCSS("animation-duration", "3s");
  await expect(notification.locator(".Toastify__progress-bar--wrp")).toHaveCSS("visibility", "hidden");
  await expect(notification).toBeHidden({ timeout: 7000 });
});

test("history storage failure has a retry instead of a misleading empty result", async ({ page }) => {
  await mockProcurements(page, { fail: true });
  await page.goto("/supplier/procurement/history");
  await expect(page.getByRole("alert").filter({ hasText: "Preview storage unavailable" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No Records Found" })).toHaveCount(0);
});

test("history supplier picker can be used with the keyboard", async ({ page }) => {
  await mockProcurements(page);
  await page.goto("/supplier/procurement/history");
  await page.getByRole("button", { name: /Add Procurement/ }).click();
  const option = page.getByRole("button", { name: /Green Valley Farm Child/ });
  await option.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Milk Quantity (L)", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Change", exact: true })).toBeVisible();
});

test("supplier detail, history and payments agree on calculated collection and summary amounts", async ({ page }) => {
  const rows = [
    { ...records[0], milkQuantity: "10", fatPercentage: "4.25", snfPercentage: "8.56", rate: 44.98, totalAmount: 449.8 },
    { ...records[0], _id: "record-2", time: "PM", milkQuantity: 90, fatPercentage: 3.75, snfPercentage: 8.10, rate: 45.67, totalAmount: 4110.3, paymentStatus: "Not Paid" },
  ];
  await mockProcurements(page, { rows });
  for (const path of ["/supplier/procurement?supplierId=child", "/supplier/procurement/history", "/supplier/payments"]) {
    await page.goto(path);
    await expect(page.getByRole("cell", { name: "₹449", exact: true }).first()).toBeVisible();
    await expect(page.getByText("Value", { exact: true }).first().locator("..")).toContainText("4,550");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.setViewportSize({ width: 1280, height: 844 });
  }
  await page.getByRole("radio", { name: "Paid", exact: true }).check();
  await expect(page.getByText("Value", { exact: true }).first().locator("..")).toContainText("449");
});
