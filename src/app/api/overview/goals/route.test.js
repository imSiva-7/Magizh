import { GET, PUT } from "./route";
import getDatabase from "@/database/connectToMongoDB";
import { requireSummaryAdmin } from "@/lib/summary-auth";
import { requireAdmin } from "@/lib/mutation-auth";
import { getProcurementStore } from "@/lib/supplier-procurements.mjs";
import { goalProgress } from "@/lib/monthly-goals.mjs";

jest.mock("@/database/connectToMongoDB", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("@/lib/summary-auth", () => ({ requireSummaryAdmin: jest.fn() }));
jest.mock("@/lib/mutation-auth", () => ({ requireAdmin: jest.fn() }));
jest.mock("@/lib/supplier-procurements.mjs", () => ({ getProcurementStore: jest.fn() }));

function database({ orders = [], procurements = [] } = {}) {
  const documents = new Map();
  const store = rows => ({ aggregate: jest.fn(pipeline => ({
    toArray: async () => {
      const { $gte, $lte } = pipeline[0].$match.date;
      const filtered = rows.filter(row => row.date >= $gte && row.date <= $lte);
      return filtered.length ? [{ amount: Number(filtered.reduce((sum, row) => sum + Number(row.totalAmount), 0).toFixed(2)) }] : [];
    },
  })) });
  const orderStore = store(orders);
  const procurementStore = store(procurements);
  const settings = {
    findOne: jest.fn(async ({ _id }) => documents.get(_id) ?? null),
    updateOne: jest.fn(async ({ _id }, { $set }) => documents.set(_id, { _id, ...$set })),
  };
  const db = { collection: jest.fn(name => {
    if (name === "orders") return orderStore;
    if (name === "settings") return settings;
    throw new Error(`Unexpected collection: ${name}`);
  }) };
  getDatabase.mockResolvedValue(db);
  getProcurementStore.mockReturnValue(procurementStore);
  return { documents, settings, orderStore, procurementStore };
}

const request = (body) => ({ json: async () => body });
const targets = { sales: 200000, profit: 100000 };

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers().setSystemTime(new Date("2026-11-22T06:00:00Z"));
  requireSummaryAdmin.mockResolvedValue(null);
  requireAdmin.mockResolvedValue(null);
});

afterEach(() => jest.useRealTimers());

test("actuals include all current-month orders and procurement through today, regardless of payment status", async () => {
  const db = database({
    orders: [
      { date: "2026-10-31", totalAmount: 90000 },
      { date: "2026-11-01", totalAmount: 75000.5, paymentStatus: "Paid" },
      { date: "2026-11-22", totalAmount: 75000, paymentStatus: "Not Paid" },
      { date: "2026-11-23", totalAmount: 30000 },
    ],
    procurements: [
      { date: "2026-10-31", totalAmount: 99999 },
      { date: "2026-11-01", totalAmount: "50000.25", paymentStatus: "Not Paid" },
      { date: "2026-11-22", totalAmount: 40000, paymentStatus: "Paid" },
      { date: "2026-12-01", totalAmount: 60000 },
    ],
  });
  const response = await GET();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    month: "2026-11", startDate: "2026-11-01", throughDate: "2026-11-22",
    actual: { sales: 150000.5, procurement: 90000.25, profit: 60000.25 },
    targets: { sales: null, profit: null },
  });
  for (const store of [db.orderStore, db.procurementStore]) {
    expect(store.aggregate).toHaveBeenCalledWith(expect.arrayContaining([
      { $match: { date: { $gte: "2026-11-01", $lte: "2026-11-22" } } },
    ]));
  }
});

test("targets persist by month and reset at the next IST month without overwriting the previous month", async () => {
  const db = database();
  expect((await PUT(request({ month: "2026-11", targets }))).status).toBe(200);
  expect((await (await GET()).json()).targets).toEqual(targets);
  expect(db.settings.updateOne).toHaveBeenCalledWith(
    { _id: "monthly_goals:2026-11" }, expect.objectContaining({ $set: expect.objectContaining({ targets }) }), { upsert: true },
  );

  // Midnight in India, even if UTC is still November.
  jest.setSystemTime(new Date("2026-11-30T18:30:00Z"));
  const next = await (await GET()).json();
  expect(next.month).toBe("2026-12");
  expect(next.targets).toEqual({ sales: null, profit: null });
  expect(next.actual).toEqual({ sales: 0, procurement: 0, profit: 0 });
  expect((await PUT(request({ month: "2026-11", targets }))).status).toBe(409);
  expect(db.documents.get("monthly_goals:2026-11").targets).toEqual(targets);
});

test("blank goals can be cleared and negative profit is preserved", async () => {
  database({ orders: [{ date: "2026-11-01", totalAmount: 100 }], procurements: [{ date: "2026-11-01", totalAmount: 150 }] });
  expect((await PUT(request({ month: "2026-11", targets: { sales: null, profit: 75.25 } }))).status).toBe(200);
  const data = await (await GET()).json();
  expect(data.targets).toEqual({ sales: null, profit: 75.25 });
  expect(data.actual.profit).toBe(-50);
  expect(goalProgress(data.actual.profit, 100)).toEqual({ percent: -50, progress: 0, remaining: 150, reached: false });
  expect(goalProgress(125, 100)).toEqual({ percent: 125, progress: 100, remaining: 0, reached: true });
  expect(goalProgress(99.99, 100)).toMatchObject({ percent: 99.9, reached: false });
  expect(goalProgress(100, null)).toBeNull();
});

test.each([-1, 0, 12.345, "1000", NaN, {}, undefined])("invalid goal %s cannot be saved", async invalid => {
  const response = await PUT(request({ month: "2026-11", targets: { sales: invalid, profit: 100 } }));
  expect(response.status).toBe(400);
  expect(getDatabase).not.toHaveBeenCalled();
});

test("both reading and writing require admin authorization", async () => {
  requireSummaryAdmin.mockResolvedValue({ status: 401 });
  requireAdmin.mockResolvedValue({ status: 403 });
  expect((await GET()).status).toBe(401);
  expect((await PUT(request({ month: "2026-11", targets }))).status).toBe(403);
  expect(getDatabase).not.toHaveBeenCalled();
});
