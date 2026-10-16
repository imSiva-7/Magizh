import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { encode } from "next-auth/jwt";
const current = {
  id: "aaaaaaaaaaaaaaaaaaaaaaaa",
  name: "Workspace Owner",
  email: "owner@example.test",
  role: "admin",
};
const fixtures = [
  { _id: current.id, name: current.name, email: current.email, role: "admin" },
  {
    _id: "bbbbbbbbbbbbbbbbbbbbbbbb",
    name: "Arun Kumar",
    email: "arun@example.test",
    role: "employee",
  },
  {
    _id: "cccccccccccccccccccccccc",
    name: "Meena Devi",
    email: "meena@example.test",
    role: "employee",
  },
  {
    _id: "dddddddddddddddddddddddd",
    name: "Dev Support",
    email: "support@example.test",
    role: "dev",
  },
  {
    _id: "eeeeeeeeeeeeeeeeeeeeeeee",
    name: "Riverbank Society",
    email: "supplier.operations.with.a.long.address@example.test",
    role: "supplier",
  },
  {
    _id: "ffffffffffffffffffffffff",
    name: "Town Store",
    email: "customer@example.test",
    role: "customer",
  },
];
test.beforeEach(async ({ context, baseURL }) => {
  loadEnvConfig(process.cwd(), true);
  test.skip(
    !process.env.NEXTAUTH_SECRET,
    "Local auth secret required for preview",
  );
  const token = await encode({
    secret: process.env.NEXTAUTH_SECRET,
    token: { role: "admin", name: current.name },
    maxAge: 300,
  });
  const domain = new URL(baseURL).hostname;
  await context.addCookies([
    { name: "next-auth.session-token", value: token, domain, path: "/" },
    {
      name: "__Secure-next-auth.session-token",
      value: token,
      domain,
      path: "/",
      secure: true,
    },
  ]);
});
async function mockUsers(page, { failedReads = [], failPatch = false } = {}) {
  let users = fixtures.map((user) => ({ ...user })),
    reads = 0,
    patches = 0;
  const writes = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.pathname === "/api/auth/session")
      return route.fulfill({ json: { user: current, expires: "2099-01-01" } });
    if (url.pathname !== "/api/admin/users")
      throw new Error(`Unexpected preview request: ${url.pathname}`);
    if (request.method() === "GET") {
      reads++;
      return route.fulfill({
        status: failedReads.includes(reads) ? 503 : 200,
        json: failedReads.includes(reads)
          ? { error: "Directory temporarily unavailable" }
          : users,
      });
    }
    if (request.method() === "PATCH") {
      patches++;
      const body = request.postDataJSON();
      writes.push({ method: "PATCH", ...body });
      if (failPatch && patches === 1)
        return route.fulfill({
          status: 409,
          json: { error: "Role update could not be completed" },
        });
      users = users.map((user) =>
        user._id === body.userId ? { ...user, role: body.role } : user,
      );
      return route.fulfill({ json: { message: "Role updated" } });
    }
    if (request.method() === "DELETE") {
      writes.push({ method: "DELETE", userId: url.searchParams.get("id") });
      users = users.filter((user) => user._id !== url.searchParams.get("id"));
      return route.fulfill({ json: { message: "Deleted" } });
    }
    throw new Error("Unexpected mutation");
  });
  return {
    writes,
    get reads() {
      return reads;
    },
  };
}
const accountRow = (page, name) =>
  page.getByRole("row").filter({ hasText: name });

test("directory filters, protected own account and mobile layout", async ({
  page,
}) => {
  await mockUsers(page);
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Admin Dashboard", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("6 of 6 accounts", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Role for Workspace Owner", { exact: true }),
  ).toBeDisabled();
  await expect(
    accountRow(page, "Workspace Owner").getByText("Your account is protected"),
  ).toBeVisible();
  await page
    .getByRole("group", { name: "Filter users by role" })
    .getByRole("button", { name: /^Employee/ })
    .click();
  await expect(
    page.getByText("2 of 6 accounts", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Search users").fill("no match");
  await expect(
    page.getByRole("heading", { name: "No matching accounts" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: "test-results/admin-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBeTruthy();
  await page.getByLabel("Search users").fill("supplier.operations");
  await expect(
    page.getByText("1 of 6 accounts", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Search users").fill("");
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: "test-results/admin-mobile.png",
    fullPage: true,
  });
});
test("saving one role retains another pending edit and does not reload the list", async ({
  page,
}) => {
  const state = await mockUsers(page);
  await page.goto("/admin");
  await page
    .getByLabel("Role for Arun Kumar", { exact: true })
    .selectOption("admin");
  await page
    .getByLabel("Role for Meena Devi", { exact: true })
    .selectOption("supplier");
  await expect(
    page.getByText("2 unsaved role changes", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Save role for Arun Kumar", exact: true })
    .click();
  await expect(
    page.getByText("1 unsaved role change", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Role for Meena Devi", { exact: true }),
  ).toHaveValue("supplier");
  expect(state.reads).toBe(1);
  expect(state.writes).toEqual([
    { method: "PATCH", userId: fixtures[1]._id, role: "admin" },
  ]);
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(
    page.getByLabel("Role for Meena Devi", { exact: true }),
  ).toHaveValue("employee");
});
test("deletion requires explicit account review and supports keyboard cancellation", async ({
  page,
}) => {
  const state = await mockUsers(page);
  await page.goto("/admin");
  await page
    .getByRole("button", { name: "Delete Arun Kumar", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Delete this account?",
    exact: true,
  });
  await expect(
    dialog.getByText("arun@example.test", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Keep account", exact: true }),
  ).toBeFocused();
  expect(state.writes).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(state.writes).toEqual([]);
  await page
    .getByRole("button", { name: "Delete Arun Kumar", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Delete account", exact: true })
    .click();
  await expect(accountRow(page, "Arun Kumar")).toHaveCount(0);
  expect(state.writes).toEqual([{ method: "DELETE", userId: fixtures[1]._id }]);
});
test("failed loads can retry and a failed refresh preserves existing accounts", async ({
  page,
}) => {
  await mockUsers(page, { failedReads: [1, 3] });
  await page.goto("/admin");
  await expect(
    page.getByRole("alert").filter({ hasText: "Could not load accounts" }),
  ).toBeVisible();
  await expect(page.getByText("No accounts yet", { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByText("6 of 6 accounts", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(
    page.getByText("Your previously loaded accounts are still shown.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(accountRow(page, "Meena Devi")).toBeVisible();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Could not load accounts" }),
  ).toHaveCount(0);
});
test("failed role saves retain the selection and expose a retryable row error", async ({
  page,
}) => {
  const state = await mockUsers(page, { failPatch: true });
  await page.goto("/admin");
  await page
    .getByLabel("Role for Arun Kumar", { exact: true })
    .selectOption("dev");
  await page
    .getByRole("button", { name: "Save role for Arun Kumar", exact: true })
    .click();
  await expect(accountRow(page, "Arun Kumar").getByRole("alert")).toHaveText(
    "Role update could not be completed",
  );
  await expect(
    page.getByLabel("Role for Arun Kumar", { exact: true }),
  ).toHaveValue("dev");
  await page
    .getByRole("button", { name: "Save role for Arun Kumar", exact: true })
    .click();
  await expect(
    page.getByText("1 unsaved role change", { exact: true }),
  ).toHaveCount(0);
  expect(state.writes).toHaveLength(2);
});
