import { GET } from "./route";
import getDatabase from "@/database/connectToMongoDB";

jest.mock("@/database/connectToMongoDB", () => ({ __esModule: true, default: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

test("product analytics return units and separate quantity totals for the selected dates", async () => {
  const results = [[], [{ _id: "Milk", totalQuantity: 12.25, totalAmount: 490 }, { _id: "Ghee", totalQuantity: .5, totalAmount: 300 }, { _id: "Curd", totalQuantity: 3.75, totalAmount: 225 }], [], [{ totalOrders: 2, totalItems: 3, totalAmount: 1015, paidAmount: 0, dueAmount: 1015 }]];
  const aggregate = jest.fn(() => ({ toArray: async () => results.shift() }));
  getDatabase.mockResolvedValue({ collection: () => ({ aggregate }) });
  const response = await GET(new Request("http://localhost/api/analytics/customers?startDate=2026-10-01&endDate=2026-10-18"));
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data.overall).toMatchObject({ litresSold: 12.75, kilogramsSold: 3.75, totalAmount: 1015 });
  expect(data.products.map(row => [row.name, row.quantity, row.unit])).toEqual([["Milk", 12.25, "L"], ["Ghee", .5, "L"], ["Curd", 3.75, "kg"]]);
  for (const [pipeline] of aggregate.mock.calls) expect(pipeline[0]).toEqual({ $match: { date: { $gte: "2026-10-01", $lte: "2026-10-18" } } });
  const group = aggregate.mock.calls[1][0].find(stage => stage.$group).$group;
  expect(group.totalQuantity).toEqual({ $sum: { $convert: { input: "$items.quantity", to: "decimal", onError: 0, onNull: 0 } } });
});

test.each(["startDate=2026-10-30&endDate=2026-10-01", "startDate=invalid"])("invalid dates fail before any database reads (%s)", async query => {
  expect((await GET(new Request(`http://localhost/api/analytics/customers?${query}`))).status).toBe(400);
  expect(getDatabase).not.toHaveBeenCalled();
});
