import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { encode } from "next-auth/jwt";

const suppliers = [
  { _id: "aaaaaaaaaaaaaaaaaaaaaaaa", supplierName: "Riverbank Milk Collection Society", supplierType: "Society", supplierTSRate: 300, isHeadSupplier: true, childSuppliers: [{ supplierId: "bbbbbbbbbbbbbbbbbbbbbbbb", supplierName: "Green Farm", cutPercentage: 10 }], supplierNumber: "9876543210", supplierAddress: "12 Market Road, Erode" },
  { _id: "bbbbbbbbbbbbbbbbbbbbbbbb", supplierName: "Green Farm", supplierType: "Farmer", supplierTSRate: 290, isChildSupplier: true, headSupplierId: "aaaaaaaaaaaaaaaaaaaaaaaa", headSupplierName: "Riverbank Milk Collection Society", supplierNumber: "9876543211" },
  { _id: "cccccccccccccccccccccccc", supplierName: "Town Milkman", supplierType: "Milkman", supplierTSRate: 300, supplierCustomRate: 39.5, supplierNumber: "9876543212" },
];

test.beforeEach(async ({ context, baseURL }) => {
  loadEnvConfig(process.cwd(), true);
  test.skip(!process.env.NEXTAUTH_SECRET, "Local auth secret required");
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { role: "admin", name: "Supplier preview" }, maxAge: 300 });
  const domain = new URL(baseURL).hostname;
  await context.addCookies([
    { name: "next-auth.session-token", value: token, domain, path: "/" },
    { name: "__Secure-next-auth.session-token", value: token, domain, path: "/", secure: true },
  ]);
});

async function mockSuppliers(page, { failFirst = false } = {}) {
  let reads = 0;
  const writes = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/auth/session") return route.fulfill({ json: { user: { role: "admin", name: "Supplier preview" }, expires: "2099-01-01" } });
    if (path === "/api/supplier") {
      if (request.method() === "GET") {
        reads += 1;
        return route.fulfill({ status: failFirst && reads === 1 ? 503 : 200, json: failFirst && reads === 1 ? { error: "Unavailable" } : suppliers });
      }
      writes.push(request.postDataJSON());
      return route.fulfill({ json: { success: true } });
    }
    return route.fulfill({ json: {} });
  });
  return writes;
}

test("failed supplier load offers retry and does not pretend the directory is empty", async ({ page }) => {
  await mockSuppliers(page, { failFirst: true });
  await page.goto("/supplier");
  await expect(page.getByRole("alert").filter({ hasText: "Could not load suppliers" })).toBeVisible();
  await expect(page.getByText("No suppliers found", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("link", { name: "Town Milkman", exact: true })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Could not load suppliers" })).toHaveCount(0);
});

test("editing a decimal fixed rate preserves supplier payload fields", async ({ page }) => {
  const writes = await mockSuppliers(page);
  await page.goto("/supplier");
  await page.getByRole("row").filter({ hasText: "Town Milkman" }).getByTitle("Actions").click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Custom Rate (Rs: 39)").fill("38.75");
  await page.getByRole("button", { name: "Update Supplier", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edit Supplier", exact: true })).toHaveCount(0);
  expect(writes).toEqual([{ supplierName: "Town Milkman", supplierType: "Milkman", isHeadSupplier: false, childSuppliers: [], supplierTSRate: 300, supplierCustomRate: 38.75, supplierNumber: "9876543212", supplierAddress: "" }]);
});
