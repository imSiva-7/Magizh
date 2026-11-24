import { customerAccountDue } from "./customer-account-due.mjs";
import { getTodayDate } from "./india-date.mjs";
import { currentGoalPeriod } from "./monthly-goals.mjs";
import { buildInventory, DAIRY_PRODUCTS, STOCK_PRODUCTS } from "./stock";
import { getProcurementStore } from "./supplier-procurements.mjs";
import { INTELLIGENCE_ROLES } from "./magizh-intelligence";

const READ_OPTIONS = { maxTimeMS: 5000 };
const periods = ["today", "week_to_date", "last_7_days", "month_to_date", "previous_month"];
const dateKey = day => day.toISOString().slice(0, 10);

export function intelligencePeriod(period, now = new Date()) {
  const throughDate = getTodayDate(now);
  const monthStart = `${throughDate.slice(0, 7)}-01`;
  const day = new Date(`${throughDate}T00:00:00Z`);
  switch (period) {
    case "today": return { startDate: throughDate, throughDate };
    case "week_to_date":
      day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7)); // Monday, using the IST calendar date.
      return { startDate: dateKey(day), throughDate };
    case "last_7_days":
      day.setUTCDate(day.getUTCDate() - 6);
      return { startDate: dateKey(day), throughDate };
    case "month_to_date": return { startDate: monthStart, throughDate };
    case "previous_month":
      day.setUTCDate(0);
      return { startDate: `${dateKey(day).slice(0, 7)}-01`, throughDate: dateKey(day) };
    default: throw new Error("Unsupported reporting period");
  }
}

const amount = field => ({ $convert: { input: `$${field}`, to: "decimal", onError: 0, onNull: 0 } });

async function dateTotals(store, { startDate, throughDate }, fields, extra = {}) {
  const [total] = await store.aggregate([
    { $match: { date: { $gte: startDate, $lte: throughDate } } },
    { $group: { _id: null, count: { $sum: 1 }, ...Object.fromEntries(
      Object.keys(fields).map(field => [field, { $sum: amount(field) }]),
    ), ...extra } },
    { $project: { _id: 0, count: 1, ...Object.fromEntries(Object.entries(fields).map(([field, digits]) => [
      field, { $toDouble: { $round: [`$${field}`, digits] } },
    ])) } },
  ], READ_OPTIONS).toArray();
  const results = Object.fromEntries(Object.keys(fields).map(field => [field, total?.[field] ?? 0]));
  if (Object.values(results).some(value => !Number.isFinite(value))) throw new Error("Invalid operational total");
  return { count: total?.count ?? 0, ...results };
}

async function productionTotals(db, period) {
  const fields = Object.fromEntries(DAIRY_PRODUCTS.map(({ field }) => [`${field}_quantity`, 4]));
  const totals = await dateTotals(db.collection("entries"), period, fields);
  return { ...period, entryCount: totals.count, quantities: DAIRY_PRODUCTS.map(({ name, field, unit }) => ({
    product: name, unit, quantity: totals[`${field}_quantity`],
  })) };
}

async function commercialTotals(db, period) {
  const [sales, procurement] = await Promise.all([
    dateTotals(db.collection("orders"), period, { totalAmount: 2 }),
    dateTotals(getProcurementStore(db), period, { totalAmount: 2, milkQuantity: 4, unpaidAmount: 2 }, {
      unpaidAmount: { $sum: { $cond: [{ $eq: ["$paymentStatus", "Paid"] }, 0, amount("totalAmount")] } },
    }),
  ]);
  return {
    ...period, orderCount: sales.count, salesINR: sales.totalAmount,
    procurementCount: procurement.count, procurementINR: procurement.totalAmount,
    milkProcuredL: procurement.milkQuantity, unpaidProcurementINR: procurement.unpaidAmount,
  };
}

async function customerDue(db, asOfDate) {
  // Reuse the current account balance calculation (including a per-account zero floor).
  // Do not read customer names, ledger events or contact information.
  const accounts = db.collection("total_orders").find({ _id: { $ne: "global" } }, {
    ...READ_OPTIONS, projection: { _id: 0, totalAmount: 1, paidAmount: 1 },
  });
  let dueInPaise = 0;
  let accountsWithDue = 0;
  for await (const account of accounts) {
    const due = customerAccountDue(account);
    if (due > 0) {
      dueInPaise += Math.round(due * 100);
      accountsWithDue++;
    }
  }
  if (!Number.isSafeInteger(dueInPaise)) throw new Error("Invalid customer balance total");
  return { asOfDate, accountsWithDue, currentCustomerDueINR: dueInPaise / 100 };
}

async function currentStock(db, asOfDate) {
  const projection = Object.fromEntries(STOCK_PRODUCTS.map(({ field }) => [field, 1]));
  const [balance, settings] = await Promise.all([
    db.collection("stock_balance").findOne({ _id: "current" }, { ...READ_OPTIONS, projection: { _id: 0, ...projection } }),
    db.collection("settings").findOne({ _id: "stock_alerts" }, {
      ...READ_OPTIONS, projection: { _id: 0, ...Object.fromEntries(Object.keys(projection).map(field => [`thresholds.${field}`, 1])) },
    }),
  ]);
  const thresholds = settings?.thresholds ?? {};
  return {
    asOfDate,
    products: balance ? buildInventory(balance, thresholds, []).map(({ name, unit, quantity, minimum, status, needsAttention }) => ({
      product: name, unit, quantity, minimum, status, needsAttention,
    })) : null,
  };
}

const tools = {
  read_stock: {
    label: "Current stock", description: "Read current finished-product stock, configured minimums, and inventory alerts. Does not track raw milk stock.",
    run: (db, now) => currentStock(db, getTodayDate(now)),
  },
  read_production: {
    label: "Production history", description: "Read recorded milk processed and other production quantities for a period.",
    dated: true, run: (db, now, period) => productionTotals(db, intelligencePeriod(period, now)),
  },
  read_commercial_totals: {
    label: "Sales and procurement", description: "Read recorded sales, procurement, milk bought and unpaid procurement in a period. These are not net profit or cash flow.",
    adminOnly: true, dated: true, run: (db, now, period) => commercialTotals(db, intelligencePeriod(period, now)),
  },
  read_customer_due: {
    label: "Current customer balances", description: "Read total outstanding customer balances across all time, not dated or overdue invoices.",
    adminOnly: true, run: (db, now) => customerDue(db, getTodayDate(now)),
  },
};

function permittedTool(role, name) {
  if (!INTELLIGENCE_ROLES.includes(role) || !Object.hasOwn(tools, name)) return null;
  const tool = tools[name];
  return !tool.adminOnly || role === "admin" ? tool : null;
}

export function intelligenceTools(role) {
  return Object.entries(tools).filter(([name]) => permittedTool(role, name)).map(([name, tool]) => ({
    type: "function",
    function: {
      name, description: tool.description, strict: true,
      parameters: {
        type: "object", additionalProperties: false,
        properties: tool.dated ? { period: { type: "string", enum: periods } } : {},
        required: tool.dated ? ["period"] : [],
      },
    },
  }));
}

export function validateToolCall(role, name, rawArgs) {
  const tool = permittedTool(role, name);
  if (!tool || typeof rawArgs !== "string" || rawArgs.length > 200) return null;
  let args;
  try { args = JSON.parse(rawArgs); } catch { return null; }
  if (!args || typeof args !== "object" || Array.isArray(args) ||
    Object.keys(args).length !== Number(Boolean(tool.dated)) || (tool.dated && !periods.includes(args.period))) return null;
  return { name, period: args.period };
}

export async function readIntelligenceTool(db, role, call, now) {
  const tool = permittedTool(role, call.name);
  if (!tool) throw new Error("Tool not allowed");
  const data = await tool.run(db, now, call.period);
  const { startDate, throughDate, asOfDate } = data;
  return { data, source: { label: tool.label, ...(asOfDate ? { asOfDate } : { startDate, throughDate }) } };
}

export function overviewTasks({ stock, commercial, customer }) {
  const tasks = [];
  if (!stock.products || stock.products.some(product => product.quantity === null)) {
    tasks.push({ label: "Verify the stock balance; some quantities are unavailable.", href: "/stock" });
  }
  const flagged = stock.products?.filter(product => product.needsAttention) ?? [];
  if (flagged.length) {
    tasks.push({ label: `Check stock for ${flagged.map(product => product.product).join(", ")}.`, href: "/stock" });
  }
  if (customer.accountsWithDue > 0) tasks.push({ label: "Review customer accounts with outstanding balances.", href: "/customer/payments" });
  if (commercial.unpaidProcurementINR > 0) tasks.push({ label: "Review unpaid procurement recorded this month.", href: "/supplier/payments" });
  return tasks;
}

export async function readIntelligenceOverview(db, role, now = new Date()) {
  if (role !== "admin") throw new Error("Overview not allowed");
  const period = currentGoalPeriod(now);
  const [commercial, stock, customer] = await Promise.all([
    commercialTotals(db, period), currentStock(db, period.throughDate), customerDue(db, period.throughDate),
  ]);
  const data = { commercial, stock, customer };
  return { ...data, tasks: overviewTasks(data) };
}
