import { GET } from "./route";
import getDatabase from "@/database/connectToMongoDB";
import { requireSummaryAdmin } from "@/lib/summary-auth";
import { getProcurementStore } from "@/lib/supplier-procurements.mjs";

jest.mock("@/database/connectToMongoDB", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("@/lib/summary-auth", () => ({ requireSummaryAdmin: jest.fn() }));
jest.mock("@/lib/supplier-procurements.mjs", () => ({ getProcurementStore: jest.fn() }));

function mockDailyAmounts(sales = [], procurement = []) {
  const store = (rows) => ({ aggregate: jest.fn(() => ({ toArray: async () => rows })) });
  const orderStore = store(sales);
  const procurementStore = store(procurement);
  getDatabase.mockResolvedValue({ collection: () => orderStore });
  getProcurementStore.mockReturnValue(procurementStore);
  return [orderStore, procurementStore];
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  requireSummaryAdmin.mockResolvedValue(null);
});

afterEach(() => jest.useRealTimers());

test("totals align by day, carry across gaps, and stop the current line at today in India", async () => {
  jest.setSystemTime(new Date("2026-10-02T18:30:00Z"));
  const stores = mockDailyAmounts([
    { date: "2026-10-03", paise: 20020 },
    { date: "2026-09-01", paise: 5000 },
    { date: "2026-10-01", paise: 10010 },
    { date: "2026-09-30", paise: 25000 },
  ], [{ date: "2026-10-02", paise: 7500 }]);

  const response = await GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  const data = await response.json();
  expect(data).toMatchObject({ currentEnd: "2026-10-03", previousEnd: "2026-09-30" });
  expect(data.sales.slice(0, 4)).toEqual([
    { day: 1, current: 100.1, previous: 50 },
    { day: 2, current: 100.1, previous: 50 },
    { day: 3, current: 300.3, previous: 50 },
    { day: 4, current: null, previous: 50 },
  ]);
  expect(data.sales.at(-1)).toEqual({ day: 30, current: null, previous: 300 });
  expect(data.procurement[2]).toEqual({ day: 3, current: 75, previous: 0 });
  for (const store of stores) {
    expect(store.aggregate.mock.calls[0][0][0]).toEqual({ $match: { date: { $gte: "2026-09-01", $lte: "2026-10-03" } } });
  }
});

test("the previous line ends at leap day and an empty metric has no series", async () => {
  jest.setSystemTime(new Date("2024-03-31T06:00:00Z"));
  mockDailyAmounts([{ date: "2024-02-29", paise: 9900 }]);
  const data = await (await GET()).json();
  expect(data.previousEnd).toBe("2024-02-29");
  expect(data.sales.slice(-3)).toEqual([
    { day: 29, current: 0, previous: 99 },
    { day: 30, current: 0, previous: null },
    { day: 31, current: 0, previous: null },
  ]);
  expect(data.procurement).toEqual([]);
});

test("denied requests do not query the database", async () => {
  requireSummaryAdmin.mockResolvedValue(new Response(null, { status: 403 }));
  expect((await GET()).status).toBe(403);
  expect(getDatabase).not.toHaveBeenCalled();
});
