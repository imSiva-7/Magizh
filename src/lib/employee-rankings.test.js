import { rankEmployeeHours, getEmployeeRankings } from "./employee-rankings";

test("ranks completed hour totals, shares ties, and excludes zero or invalid totals", () => {
  const rankings = rankEmployeeHours([
    { empID: "0004", name: "Devi", hundredths: 9050, completedDays: 10 },
    { empID: "0002", name: "Bala", hundredths: 10025, completedDays: 11 },
    { empID: "0001", name: "Anu", hundredths: 10025, completedDays: 12 },
    { empID: "0003", hundredths: 0 },
    { empID: "0005", hundredths: -50 },
    { empID: "0006", hundredths: NaN },
  ]);
  expect(rankings.map(row => [row.empID, row.rank, row.tied, row.totalHours])).toEqual([
    ["0001", 1, true, 100.25], ["0002", 1, true, 100.25], ["0004", 3, false, 90.5],
  ]);
  expect(rankEmployeeHours([])).toEqual([]);
});

test("database ranking uses a complete month independent of search and only finished past or present shifts", async () => {
  const aggregate = jest.fn(() => ({ toArray: async () => [{ empID: "0001", hundredths: 850, completedDays: 1 }] }));
  const db = { collection: jest.fn(() => ({ aggregate })) };
  expect((await getEmployeeRankings(db, "2026-10", "2026-10-18"))[0]).toMatchObject({ empID: "0001", totalHours: 8.5, rank: 1 });
  expect(aggregate.mock.calls[0][0]).toContainEqual({ $match: {
    date: { $regex: "^2026-10-", $lte: "2026-10-18" },
    checkIn: { $exists: true, $nin: [null, ""] }, checkOut: { $exists: true, $nin: [null, ""] }, hours: { $gt: 0, $lte: 24 },
  } });
  expect(JSON.stringify(aggregate.mock.calls[0][0])).not.toContain("search");
});
