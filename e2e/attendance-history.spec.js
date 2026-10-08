import { test, expect } from "@playwright/test";

test.describe("Employee Attendance Protected Access", () => {
  test("should redirect unauthenticated user from /employee to /login", async ({ page }) => {
    await page.goto("/employee");
    await expect(page).toHaveURL(/\/login/);
  });

  test("should redirect unauthenticated user from /employee/attendance/history to /login", async ({ page }) => {
    await page.goto("/employee/attendance/history");
    await expect(page).toHaveURL(/\/login/);
  });
});
