import { GET } from "./route";
import getDatabase from "@/database/connectToMongoDB";

jest.mock("@/database/connectToMongoDB", () => ({
  __esModule: true,
  default: jest.fn(),
}));

const entries = [
  { date: "2026-09-30", milk_quantity: 100 },
  { date: "2026-10-01", milk_quantity: 50 },
  { date: "2026-10-17", milk_quantity: 75 },
  { date: "2026-10-18", milk_quantity: 25 },
];

beforeEach(() => {
  getDatabase.mockResolvedValue({
    collection: (name) => {
      expect(name).toBe("entries");
      return {
        find: (query) => ({
          sort: () => ({
            toArray: async () => entries
              .filter(({ date }) => (!query.date?.$gte || date >= query.date.$gte)
                && (!query.date?.$lte || date <= query.date.$lte))
              .reverse(),
          }),
        }),
      };
    },
  });
});

test.each([
  "fromDate=2026-10-01&toDate=2026-10-17",
  "startDate=2026-10-01&endDate=2026-10-17",
])("production history respects date filters for %s", async (query) => {
  const response = await GET({ url: `http://localhost/api/production/history?${query}` });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual([entries[2], entries[1]]);
});

test.each([
  ["startDate=2026-10-17", [entries[3], entries[2]]],
  ["endDate=2026-10-01", [entries[1], entries[0]]],
  ["", entries.slice().reverse()],
])("production history supports open date boundaries: %s", async (query, expected) => {
  const response = await GET({ url: `http://localhost/api/production/history?${query}` });
  expect(await response.json()).toEqual(expected);
});
