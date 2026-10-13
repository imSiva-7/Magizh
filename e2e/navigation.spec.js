import { test, expect } from "@playwright/test";

test.describe("Home and Public Navigation", () => {
  test("should load the home page with dashboard title and header", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Magizh Dairy/i);

    // Header brand verification
    const header = page.locator("header").first();
    await expect(header).toBeVisible();

    // Check dashboard heading or login link
    const dashboardHeading = page.getByRole("heading", { name: "Every day, made simpler." });
    await expect(dashboardHeading).toBeVisible();

    // Check login link is present for unauthenticated visitor
    const loginLink = page.getByRole("link", { name: /Log in/i });
    await expect(loginLink).toBeVisible();
  });

  test("should navigate to login page when clicking Log In", async ({ page }) => {
    await page.goto("/");
    const loginLink = page.getByRole("link", { name: /Log in/i });
    await loginLink.click();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: /Welcome Back/i })).toBeVisible();
  });

  test("should display navigation cards on the home page", async ({ page }) => {
    await page.goto("/");
    // Check navigation cards are present
    const productionLink = page.getByRole("link", { name: /Production/i }).first();
    await expect(productionLink).toBeVisible();

    const supplierLink = page.getByRole("link", { name: /Suppliers/i }).first();
    await expect(supplierLink).toBeVisible();

    const customerLink = page.getByRole("link", { name: /Customers/i }).first();
    await expect(customerLink).toBeVisible();
  });
});

test.describe("Protected Routes Redirection", () => {
  const protectedRoutes = [
    "/productions",
    "/stock",
    "/supplier",
    "/customer",
    "/admin",
  ];

  for (const route of protectedRoutes) {
    test(`should redirect unauthenticated user from ${route} to /login`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login/);
    });
  }
});
