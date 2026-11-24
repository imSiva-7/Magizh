import { intelligencePeriod, intelligenceTools, overviewTasks, readIntelligenceOverview, readIntelligenceTool, validateToolCall } from "./magizh-intelligence-data";

const now = new Date("2026-11-30T18:30:00Z"); // Dec 1, midnight in India

test("reporting windows use the IST date, include the current day and roll over months", () => {
  expect(intelligencePeriod("today", now)).toEqual({ startDate: "2026-12-01", throughDate: "2026-12-01" });
  expect(intelligencePeriod("week_to_date", now)).toEqual({ startDate: "2026-11-30", throughDate: "2026-12-01" });
  expect(intelligencePeriod("last_7_days", now)).toEqual({ startDate: "2026-11-25", throughDate: "2026-12-01" });
  expect(intelligencePeriod("previous_month", now)).toEqual({ startDate: "2026-11-01", throughDate: "2026-11-30" });
  expect(() => intelligencePeriod("yesterday", now)).toThrow();
});

test.each(["employee", "dev"])("%s can read stock and production only", async role => {
  expect(intelligenceTools(role).map(tool => tool.function.name)).toEqual(["read_stock", "read_production"]);
  expect(validateToolCall(role, "read_commercial_totals", '{"period":"today"}')).toBeNull();
  expect(validateToolCall(role, "read_customer_due", "{}")).toBeNull();
  const db = { collection: jest.fn() };
  await expect(readIntelligenceOverview(db, role, now)).rejects.toThrow();
  await expect(readIntelligenceTool(db, role, { name: "read_customer_due" }, now)).rejects.toThrow();
  expect(db.collection).not.toHaveBeenCalled();
});

test("tool arguments are enums and objects, not Mongo filters, dates or arbitrary fields", () => {
  expect(intelligenceTools("supplier")).toEqual([]);
  expect(validateToolCall("admin", "constructor", "{}")).toBeNull();
  expect(validateToolCall("admin", "read_production", '{"period":{"$ne":null}}')).toBeNull();
  expect(validateToolCall("admin", "read_production", '{"period":"2026-12-01"}')).toBeNull();
  expect(validateToolCall("admin", "read_production", '{"period":"today","role":"admin"}')).toBeNull();
  expect(validateToolCall("admin", "read_stock", '[]')).toBeNull();
  expect(validateToolCall("admin", "read_production", '{"period":"today"}')).toEqual({ name: "read_production", period: "today" });
});

test.each(["legacy", "nested", "flat"])("the overview uses bounded %s aggregates, stock rules and current account balances", async storage => {
  const previous = process.env.PROCUREMENTS_STORAGE;
  process.env.PROCUREMENTS_STORAGE = storage;
  try {
    const db = {
      collection: jest.fn(name => stores[name]),
    };
    const aggregate = row => jest.fn(() => ({ toArray: async () => [row] }));
    const proc = aggregate({ count: 2, totalAmount: 100.67, milkQuantity: 9.4321, unpaidAmount: 50.12 });
    const accounts = [
      { totalAmount: 60.15, paidAmount: 40, customerName: "Never send this" },
      { totalAmount: 20, paidAmount: 50 }, // Overpayment must not offset the first account's due.
    ];
    const stores = {
      orders: { aggregate: aggregate({ count: 3, totalAmount: 700.01 }) },
      procurements: { aggregate: proc },
      supplier_procurements: { aggregate: proc },
      stock_balance: { findOne: jest.fn(async () => ({ butter: 1, cream: 2, curd: 3, ghee: 4, soft_paneer: 5, premium_paneer: 6 })) },
      settings: { findOne: jest.fn(async () => ({ thresholds: { butter: 2, ghee: 4 } })) },
      total_orders: { find: jest.fn(() => accounts) },
    };
    const result = await readIntelligenceOverview(db, "admin", now);
    const match = { $match: { date: { $gte: "2026-12-01", $lte: "2026-12-01" } } };
    expect(proc).toHaveBeenCalledWith(expect.arrayContaining([match, expect.objectContaining({ $group: expect.objectContaining({ unpaidAmount: {
      $sum: { $cond: [{ $eq: ["$paymentStatus", "Paid"] }, 0, { $convert: { input: "$totalAmount", to: "decimal", onError: 0, onNull: 0 } }] },
    } }) })]), { maxTimeMS: 5000 });
    expect(stores.orders.aggregate).toHaveBeenCalledWith(expect.arrayContaining([match]), { maxTimeMS: 5000 });
    expect(stores.total_orders.find).toHaveBeenCalledWith({ _id: { $ne: "global" } }, { maxTimeMS: 5000, projection: { _id: 0, totalAmount: 1, paidAmount: 1 } });
    expect(result.commercial).toMatchObject({ salesINR: 700.01, procurementINR: 100.67, milkProcuredL: 9.4321 });
    expect(result.customer).toEqual({ asOfDate: "2026-12-01", accountsWithDue: 1, currentCustomerDueINR: 20.15 });
    expect(result.stock.products.find(item => item.product === "Ghee").needsAttention).toBe(false);
    expect(result.tasks.map(task => task.href)).toEqual(["/stock", "/customer/payments", "/supplier/payments"]);
    expect(result.tasks[0].label).toContain("Butter");
    expect(JSON.stringify(result)).not.toContain("Never send this");
  } finally {
    if (previous === undefined) delete process.env.PROCUREMENTS_STORAGE;
    else process.env.PROCUREMENTS_STORAGE = previous;
  }
});

test("an absent stock balance is unknown, not fabricated as six out-of-stock products", async () => {
  const db = { collection: () => ({ findOne: async () => null }) };
  const { data, source } = await readIntelligenceTool(db, "employee", { name: "read_stock" }, now);
  expect(data).toEqual({ asOfDate: "2026-12-01", products: null });
  expect(source).toEqual({ label: "Current stock", asOfDate: "2026-12-01" });
  expect(overviewTasks({ stock: data, commercial: { unpaidProcurementINR: 0 }, customer: { accountsWithDue: 0 } }))
    .toEqual([{ label: "Verify the stock balance; some quantities are unavailable.", href: "/stock" }]);
});
