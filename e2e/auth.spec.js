import { test, expect } from "@playwright/test";

test.describe("Authentication Flows", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test("should render the login form elements correctly", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Welcome Back!" })).toBeVisible();
    await expect(page.getByLabel("Email Address")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.locator("form").getByRole("button", { name: /Log In/i })).toBeVisible();
  });

  test("should require email and password inputs", async ({ page }) => {
    const emailInput = page.getByLabel("Email Address");
    const passwordInput = page.getByLabel("Password");

    await expect(emailInput).toHaveAttribute("required", "");
    await expect(passwordInput).toHaveAttribute("required", "");
  });

  test("should show error on invalid credentials", async ({ page }) => {
    await page.getByLabel("Email Address").fill("nonexistent@example.com");
    await page.getByLabel("Password").fill("wrongpassword123");
    await page.locator("form").getByRole("button", { name: /Log In/i }).click();

    // Verify error message appears
    const errorMessage = page.locator("text=Invalid email or password");
    await expect(errorMessage).toBeVisible({ timeout: 10000 });
  });

  test("should load unauthorized page if directly accessed", async ({ page }) => {
    await page.goto("/unauthorized");
    // Verify unauthorized page renders without crashing
    await expect(page).toHaveURL(/\/unauthorized/);
  });
});
