import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { encode } from "next-auth/jwt";

const employee = empID => ({ _id: empID, empID, name: empID === "EMP001" ? "Anitha" : "Bala", salary: 18000 });
const attendance = empID => ({ employee: employee(empID), period: { daysInPeriod: 30, daysWorked: 20 }, summary: { standardHours: 240, totalHoursWorked: 160, hourlyRate: 75, regularPay: 12000, overtimePay: 0, grossSalary: 12000, totalAdvances: 0, netSalary: 12000 }, advances: [], attendance: [] });

for (const history of [false, true]) {
  test(`admin edits attendance times on mobile ${history ? "history" : "details"}`, async ({ page }) => {
    let day = { date: "2026-01-15", checkIn: "08:00:00", checkOut: "16:00:00", hoursWorked: 8, status: "present", empID: "EMP001", name: "Anitha" };
    let saved;
    await page.route("**/api/attendance**", route => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/attendance/times") {
        saved = route.request().postDataJSON();
        day = { ...day, checkIn: saved.checkIn, checkOut: saved.checkOut, hoursWorked: 9 };
        return route.fulfill({ json: { message: "Updated" } });
      }
      if (url.pathname === "/api/attendance/history") return route.fulfill({ json: { records: [day], summary: { uniqueEmployees: 1, totalHours: day.hoursWorked } } });
      if (url.pathname === "/api/attendance") return route.fulfill({ json: { ...attendance("EMP001"), attendance: [day] } });
      return route.fulfill({ json: { rankings: [] } });
    });
    await page.goto(history ? "/employee/attendance/history" : "/employee/attendance?empID=EMP001&month=2026-01");
    const trigger = page.getByRole("button", { name: /Attendance actions for/ });
    await trigger.click();
    await page.getByRole("button", { name: "Edit times", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Edit attendance", exact: true })).toBeVisible();
    const form = page.getByRole("form", { name: /Edit attendance/ });
    await form.getByLabel("Check in hour", { exact: true }).selectOption("9");
    await form.getByLabel("Check out hour", { exact: true }).selectOption("6");
    await form.getByLabel("Check out AM or PM", { exact: true }).selectOption("PM");
    await form.getByRole("button", { name: "Save times", exact: true }).click();
    await expect(form).toHaveCount(0);
    expect(saved).toMatchObject({ empID: "EMP001", date: "2026-01-15", expectedCheckIn: "08:00:00", expectedCheckOut: "16:00:00" });
    await expect(page.getByRole("cell", { name: "9h 00m", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test.beforeEach(async ({ page, context, baseURL }) => {
  loadEnvConfig(process.cwd(), true);
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { role: "admin", name: "Mobile audit" }, maxAge: 600 });
  const domain = new URL(baseURL).hostname;
  await context.addCookies(["next-auth.session-token", "__Secure-next-auth.session-token"].map(name => ({ name, value: token, domain, path: "/", secure: name.startsWith("__Secure") })));
  await page.setViewportSize({ width: 320, height: 568 });
  await page.route("**/api/**", route => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() !== "GET") throw new Error("Live writes are forbidden in this audit");
    if (url.pathname === "/api/auth/session") return route.fulfill({ json: { user: { role: "admin" }, expires: "2099-01-01" } });
    if (url.pathname === "/api/employee") return route.fulfill({ json: [employee("EMP001"), employee("EMP002")] });
    if (url.pathname === "/api/attendance") return route.fulfill({ json: attendance(url.searchParams.get("empID")) });
    return route.fulfill({ json: { rankings: [] } });
  });
});

test("switching employees ignores an older slow attendance response", async ({ page }) => {
  let release, requested;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { requested = resolve; });
  await page.route("**/api/attendance?**", async route => {
    if (new URL(route.request().url()).searchParams.get("empID") !== "EMP001") return route.fallback();
    requested(); await gate;
    return route.fulfill({ json: attendance("EMP001") }).catch(() => {});
  });
  await page.goto("/employee/attendance");
  await page.getByLabel("Select Employee", { exact: true }).selectOption("EMP001");
  await started;
  await page.getByLabel("Select Employee", { exact: true }).selectOption("EMP002");
  const name = page.getByText("Name:", { exact: true }).locator("..");
  await expect(name).toContainText("Bala");
  release();
  await page.waitForLoadState("networkidle");
  await expect(name).toContainText("Bala");
  await expect(name).not.toContainText("Anitha");
});

for (const width of [320, 390]) {
  test(`attendance history fits all columns on a ${width}px screen`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.route("**/api/attendance/history?*", route => route.fulfill({ json: {
      records: [
        { date: "2026-01-15", empID: "EMP001", name: "Mageshwari", checkIn: "23:59:00", checkOut: "06:15:00", checkOutNextDay: true, hoursWorked: 6.27 },
        { date: "2026-01-15", empID: "EMP002", name: "A long employee name", checkIn: "08:44:00", hoursWorked: 0 },
      ],
      summary: { uniqueEmployees: 2, totalHours: 6.27, incompleteCount: 1 },
    } }));
    await page.goto("/employee/attendance/history");
    const day = page.getByRole("region", { name: "15/01/26", exact: true });
    const table = day.getByRole("table");
    await expect(table.getByRole("columnheader")).toHaveCount(5);
    await expect(table.getByRole("columnheader", { name: "Check out (IST)", exact: true })).toBeVisible();
    await expect(table.getByText("11:59 PM", { exact: true })).toBeVisible();
    await expect(table.getByText("(+1 day)", { exact: false })).toBeVisible();
    await expect(table.getByText("Missing", { exact: true })).toBeVisible();
    await expect(table.getByRole("button", { name: /Attendance actions for EMP001/ })).toBeVisible();

    const geometry = await table.evaluate(element => ({
      tableWidth: element.getBoundingClientRect().width,
      wrapperWidth: element.parentElement.clientWidth,
      overflowingCells: [...element.querySelectorAll("th, td")]
        .filter(cell => cell.scrollWidth > cell.clientWidth + 1)
        .map(cell => cell.textContent),
    }));
    expect(geometry.tableWidth).toBeLessThanOrEqual(geometry.wrapperWidth + 1);
    expect(geometry.overflowingCells).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await day.screenshot({ path: `test-results/attendance-history-${width}.png` });
  });
}

test("attendance status labels stay on one line on mobile", async ({ page }) => {
  await page.route("**/api/attendance?*", route => route.fulfill({ json: {
    ...attendance("EMP001"),
    attendance: [
      { date: "2026-01-13", status: "present", checkIn: "13:34:00", checkOut: "12:45:00", hoursWorked: 11.18 },
      { date: "2026-01-14", status: "present", checkIn: "08:00:00", hoursWorked: 0 },
      { date: "2026-01-15", status: "pending", hoursWorked: 0 },
    ],
  } }));
  await page.goto("/employee/attendance?empID=EMP001&month=2026-01");
  const table = page.getByRole("table");
  const checkInTime = table.getByText("1:34 PM", { exact: true });
  const checkOutTime = table.getByText("12:45 PM", { exact: true });
  const missingCheckout = table.getByText("Missing checkout", { exact: true });
  const notRecorded = table.getByText("Not recorded yet", { exact: true });
  await expect(checkInTime).toBeVisible();
  await expect(checkOutTime).toBeVisible();
  await expect(missingCheckout).toBeVisible();
  await expect(notRecorded).toBeVisible();
  for (const label of [checkInTime, checkOutTime, missingCheckout, notRecorded]) {
    expect(await label.evaluate(element => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getClientRects().length;
    })).toBe(1);
  }
});

test("advance entry hides quick shortcuts and fits a narrow mobile screen", async ({ page }) => {
  await page.goto("/employee/attendance?empID=EMP002");
  const shortcuts = page.getByRole("navigation", { name: "Quick entries" });
  await expect(shortcuts).toBeVisible();
  await page.getByRole("button", { name: "+ Add Advance", exact: true }).click();
  await expect(shortcuts).toBeHidden();
  const form = page.locator("main form");
  await form.getByRole("button", { name: "Save Advance", exact: true }).scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await form.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(shortcuts).toBeVisible();
});
