import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { encode } from "next-auth/jwt";
import { month as indiaMonth, getPreviousMonthDate } from "../src/lib/india-date.mjs";

const month = indiaMonth(), previousMonth = getPreviousMonthDate().slice(0, 7);
const employees = ["Anu", "Bala", "Chitra", "Devi"].map((name, index) => ({ _id: String(index + 1).padStart(24, "0"), empID: `000${index + 1}`, name, gender: "Female", salary: 15000 }));
const rankings = employees.slice(0, 3).map((employee, index) => ({ ...employee, totalHours: index < 2 ? 100.25 : 80, completedDays: 12, rank: index < 2 ? 1 : 3, tied: index < 2 }));

async function setup(page, context, baseURL, { failFirst = false } = {}) {
  loadEnvConfig(process.cwd(), true);
  test.skip(!process.env.NEXTAUTH_SECRET, "Local auth secret required");
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { role: "admin" }, maxAge: 300 });
  await context.addCookies([{ name: "__Secure-next-auth.session-token", value: token, domain: new URL(baseURL).hostname, path: "/", secure: true }]);
  const requests = [];
  await page.route("**/api/**", route => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() !== "GET") throw new Error("Ranking previews must never write live data");
    if (url.pathname === "/api/auth/session") return route.fulfill({ json: { user: { role: "admin" }, expires: "2099-01-01" } });
    if (url.pathname === "/api/employee") return route.fulfill({ json: employees });
    if (url.pathname === "/api/attendance/rankings") {
      requests.push(url.searchParams);
      if (failFirst && requests.length === 1) return route.fulfill({ status: 503, json: { error: "Unavailable" } });
      const selectedMonth = url.searchParams.get("month");
      return route.fulfill({ json: { month: selectedMonth, rankings: selectedMonth === month ? rankings : [] } });
    }
    if (url.pathname === "/api/attendance/history") {
      let records = url.searchParams.get("month") === month ? employees.map((employee, index) => ({ ...employee, date: `${month}-01`, checkIn: "08:00", checkOut: index === 3 ? null : "17:00", hoursWorked: index === 3 ? 0 : 9 })) : [];
      if (url.searchParams.get("search")) records = records.filter(row => row.name.toLowerCase().includes(url.searchParams.get("search").toLowerCase()));
      if (url.searchParams.get("status") === "incomplete") records = records.filter(row => !row.checkOut);
      return route.fulfill({ json: { records, summary: { uniqueEmployees: records.length, totalHours: records.reduce((sum, row) => sum + row.hoursWorked, 0), incompleteCount: records.filter(row => !row.checkOut).length } } });
    }
    if (url.pathname === "/api/attendance") return route.fulfill({ json: { employee: employees.find(row => row.empID === url.searchParams.get("empID")), period: { month: url.searchParams.get("month"), daysInPeriod: 31 }, summary: {}, attendance: [], advances: [] } });
    return route.fulfill({ json: [] });
  });
  return requests;
}

test("employee directory keeps ranks out of the table and supports name search", async ({ page, context, baseURL }) => {
  const requests = await setup(page, context, baseURL);
  await page.goto("/employee");
  const anu = page.getByRole("row").filter({ hasText: "Anu" });
  await expect(anu.getByRole("link", { name: "Anu", exact: true })).toBeVisible();
  await expect(page.getByRole("table").locator("[data-employee-rank]")).toHaveCount(0);
  await page.getByLabel("Search Employees:").fill("Chitra");
  const chitra = page.getByRole("row").filter({ hasText: "Chitra" });
  await expect(chitra.getByRole("link", { name: "Chitra", exact: true })).toBeVisible();
  await expect(anu).toHaveCount(0);
  expect(requests.every(query => query.get("month") === month && !query.has("search"))).toBe(true);
});

test("monthly leaderboard stays independent of attendance filters, switches periods, and fits narrow mobile", async ({ page, context, baseURL }) => {
  const requests = await setup(page, context, baseURL);
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/employee/attendance/history");
  const board = page.getByRole("region", { name: "Monthly employee hours ranking" });
  await expect(board.locator('[data-employee-rank="1"]')).toHaveCount(2);
  await expect(page.getByRole("table").locator("[data-employee-rank]")).toHaveCount(0);
  await expect(board.getByText("100.25", { exact: false })).toHaveCount(2);
  await expect(board.getByRole("link", { name: "Chitra" })).toHaveAttribute("href", `/employee/attendance?empID=0003&month=${month}`);
  await page.getByLabel("Show", { exact: true }).selectOption("incomplete");
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(2);
  await expect(board.locator('[data-employee-rank="1"]')).toHaveCount(2);
  expect(requests).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/employee-ranking-mobile.png", fullPage: true });
  await page.getByLabel("Month", { exact: true }).fill(previousMonth);
  await expect(board).toContainText("No completed attendance hours to rank this month.");
  await expect(board.locator("[data-employee-rank]")).toHaveCount(0);
});

test("ranking failure offers retry without awarding a winner from partial history", async ({ page, context, baseURL }) => {
  await setup(page, context, baseURL, { failFirst: true });
  await page.goto("/employee/attendance/history");
  const board = page.getByRole("region", { name: "Monthly employee hours ranking" });
  await expect(board.getByRole("alert")).toContainText("Hours ranking unavailable");
  await expect(page.locator("[data-employee-rank]")).toHaveCount(0);
  await board.getByRole("button", { name: "Retry ranking" }).click();
  await expect(board.locator('[data-employee-rank="1"]')).toHaveCount(2);
});

test("employee details show the monthly badge and respect a historical-month link", async ({ page, context, baseURL }) => {
  await setup(page, context, baseURL);
  await page.goto(`/employee/attendance?empID=0001&month=${month}`);
  await expect(page.locator('[data-employee-rank="1"]')).toContainText("Joint top employee");
  await page.goto(`/employee/attendance?empID=0001&month=${previousMonth}`);
  await expect(page.getByLabel("Select Month", { exact: true })).toHaveValue(previousMonth);
  await expect(page.locator("[data-employee-rank]")).toHaveCount(0);
});
