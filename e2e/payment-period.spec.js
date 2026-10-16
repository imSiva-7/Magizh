import { test, expect } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { encode } from "next-auth/jwt";

test.beforeEach(async ({ context, baseURL }) => {
  loadEnvConfig(process.cwd(), true);
  test.skip(!process.env.NEXTAUTH_SECRET, "Local auth secret required");
  const token = await encode({
    secret: process.env.NEXTAUTH_SECRET,
    token: { role: "admin", name: "Payment preview" },
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

const customers = [
  { _id: "a", customerName: "Alpha Shop", customerType: "Retail" },
  { _id: "b", customerName: "Beta Shop", customerType: "Retail" },
];
const period = [
  {
    customerId: "a",
    totalOrders: 2,
    totalAmount: 1000,
    receiptCount: 3,
    receivedAmount: 250,
    netChange: 750,
    salesDaily: [
      { date: "2026-10-01", totalOrders: 1, totalAmount: 400 },
      { date: "2026-10-02", totalOrders: 1, totalAmount: 600 },
    ],
    receiptsDaily: [{ date: "2026-10-02", receivedAmount: 250 }],
  },
  {
    customerId: "b",
    totalOrders: 0,
    totalAmount: 0,
    receiptCount: 1,
    receivedAmount: 400,
    netChange: -400,
    salesDaily: [],
    receiptsDaily: [{ date: "2026-10-03", receivedAmount: 400 }],
  },
];
const summaryCard = (page, title) =>
  page.getByRole("heading", { name: title, exact: true }).locator("../..");
const stat = (summary, label) =>
  summary.getByText(label, { exact: true }).locator("..");

async function mockCustomer(page, fail = false) {
  const balanceRequests = [],
    summaryRequests = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (request.method() !== "GET")
      throw new Error("Unmocked writes forbidden");
    if (url.pathname === "/api/auth/session")
      return route.fulfill({
        json: { user: { role: "admin" }, expires: "2099-01-01" },
      });
    if (url.pathname === "/api/customer")
      return route.fulfill({ json: customers });
    if (url.pathname === "/api/customer/total_orders") {
      balanceRequests.push(url);
      return route.fulfill({
        json: {
          _id: "a",
          totalAmount: 99000,
          paidAmount: 1000,
          dueAmount: 98000,
        },
      });
    }
    if (url.pathname === "/api/customer/payment-summary") {
      summaryRequests.push(url);
      if (fail) {
        fail = false;
        return route.fulfill({ status: 503, json: { error: "Unavailable" } });
      }
      return route.fulfill({
        json: {
          customers:
            url.searchParams.get("endDate") === "2026-10-01"
              ? [
                  {
                    ...period[0],
                    totalOrders: 1,
                    totalAmount: 400,
                    receivedAmount: 0,
                    receiptCount: 0,
                    netChange: 400,
                    salesDaily: period[0].salesDaily.slice(0, 1),
                    receiptsDaily: [],
                  },
                ]
              : period,
        },
      });
    }
    if (url.pathname === "/api/customer/order/history")
      return route.fulfill({ json: { orders: [] } });
    return route.fulfill({ json: [] });
  });
  return { balanceRequests, summaryRequests };
}

test("customer totals and background trends follow search and dates; balances load only for entry", async ({
  page,
}) => {
  const { balanceRequests, summaryRequests } = await mockCustomer(page);
  await page.goto("/customer/payments");
  const summary = summaryCard(page, "Filtered Customers Summary");
  await expect(stat(summary, "Total Sales")).toContainText("1,000.00");
  await expect(stat(summary, "Net received")).toContainText("650.00");
  await expect(stat(summary, "Net receivable change")).toContainText("350.00");
  await expect(summary.getByTestId("stat-trend")).toHaveCount(4);
  await expect(summary.getByTestId("stat-trend").first()).toHaveAttribute(
    "data-points",
    "3",
  );
  await summary.screenshot({
    path: "test-results/customer-payment-trends-desktop.png",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await summary.screenshot({
    path: "test-results/customer-payment-trends-mobile.png",
  });
  expect(balanceRequests).toHaveLength(0);
  await expect(
    page.getByRole("button", { name: "Record payment", exact: true }),
  ).toHaveCount(2);
  await page.getByPlaceholder("Search by name").fill("Beta");
  await expect(stat(summary, "Net receivable change")).toContainText("-400.00");
  await expect(summary.getByTestId("stat-trend").first()).toHaveAttribute(
    "data-points",
    "1",
  );
  await page.getByPlaceholder("Search by name").fill("");
  await page.getByLabel("To Date", { exact: true }).fill("2026-10-01");
  await expect(stat(summary, "Total Sales")).toContainText("400.00");
  await expect(summary.getByTestId("stat-trend").first()).toHaveAttribute(
    "data-points",
    "1",
  );
  expect(summaryRequests.at(-1).searchParams.get("endDate")).toBe("2026-10-01");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      summary.evaluate((el) => el.getBoundingClientRect().width <= innerWidth),
    )
    .toBeTruthy();
  await page
    .getByRole("button", { name: "Record payment", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(balanceRequests).toHaveLength(1);
});

test("failed customer period summary offers retry without lifetime fallback", async ({
  page,
}) => {
  const { balanceRequests } = await mockCustomer(page, true);
  await page.goto("/customer/payments");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Could not load data for this period" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Filtered Customers Summary" }),
  ).toHaveCount(0);
  expect(balanceRequests).toHaveLength(0);
  await page.getByRole("button", { name: "Retry period data" }).click();
  await expect(
    summaryCard(page, "Filtered Customers Summary").getByTestId("stat-trend"),
  ).toHaveCount(4);
});

test("supplier summary figures and graphs follow paid/due, search and date filters", async ({
  page,
}) => {
  const suppliers = [
    { _id: "a", supplierName: "Alpha Dairy", supplierType: "Farmer" },
    { _id: "b", supplierName: "Beta Dairy", supplierType: "Farmer" },
  ];
  const records = [
    {
      _id: "1",
      supplierId: "a",
      date: "2026-10-01",
      milkQuantity: 10,
      totalAmount: 400,
      paymentStatus: "Paid",
    },
    {
      _id: "2",
      supplierId: "a",
      date: "2026-10-02",
      milkQuantity: 20,
      totalAmount: 800,
      paymentStatus: "Not Paid",
    },
    {
      _id: "3",
      supplierId: "b",
      date: "2026-10-03",
      milkQuantity: 5,
      totalAmount: 250,
      paymentStatus: "Paid",
    },
  ];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== "GET")
      throw new Error("Unmocked writes forbidden");
    if (url.pathname === "/api/auth/session")
      return route.fulfill({
        json: { user: { role: "admin" }, expires: "2099-01-01" },
      });
    if (url.pathname === "/api/supplier")
      return route.fulfill({ json: suppliers });
    if (url.pathname === "/api/supplier/procurement/history")
      return route.fulfill({
        json: records.filter(
          (row) =>
            (!url.searchParams.get("startDate") ||
              row.date >= url.searchParams.get("startDate")) &&
            (!url.searchParams.get("endDate") ||
              row.date <= url.searchParams.get("endDate")),
        ),
      });
    return route.fulfill({ json: [] });
  });
  await page.goto("/supplier/payments");
  const summary = summaryCard(page, "Filtered Suppliers Summary");
  await expect(stat(summary, "Total Amount")).toContainText("1,450.00");
  await expect(summary.getByTestId("stat-trend")).toHaveCount(4);
  await expect(summary.getByTestId("stat-trend").first()).toHaveAttribute(
    "data-points",
    "3",
  );
  await summary.screenshot({
    path: "test-results/supplier-payment-trends-desktop.png",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await summary.screenshot({
    path: "test-results/supplier-payment-trends-mobile.png",
  });
  await page.getByRole("radio", { name: "Paid", exact: true }).check();
  await expect(stat(summary, "Total Amount")).toContainText("650.00");
  await expect(stat(summary, "Amount Due")).toContainText("0.00");
  await expect(summary.getByTestId("stat-trend").first()).toHaveAttribute(
    "data-points",
    "2",
  );
  await page.getByPlaceholder("Search by name").fill("Alpha");
  await expect(stat(summary, "Total Amount")).toContainText("400.00");
  await page.getByRole("radio", { name: "Due", exact: true }).check();
  await expect(stat(summary, "Amount Due")).toContainText("800.00");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("radio", { name: "All Records", exact: true }).check();
  await page.getByLabel("To Date", { exact: true }).fill("2026-10-01");
  await expect(stat(summary, "Total Amount")).toContainText("400.00");
  await expect(summary.getByTestId("stat-trend").first()).toHaveAttribute(
    "data-points",
    "1",
  );
});
