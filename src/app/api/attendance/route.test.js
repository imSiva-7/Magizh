import { POST, PUT } from "./route";
import getDatabase from "@/database/connectToMongoDB";
jest.mock("@/lib/mutation-auth", () => ({ requireStaff: async () => null, requireAdmin: async () => null }));
jest.mock("@/lib/summary-auth", () => ({ requireSummaryAdmin: async () => null }));
jest.mock("@/database/connectToMongoDB", () => ({ __esModule: true, default: jest.fn() }));
const findOne = jest.fn(), updateOne = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  getDatabase.mockResolvedValue({ collection: () => ({ findOne, updateOne }) });
  findOne.mockResolvedValue({ empID: "0001", advances: { "2026-04": [{ _id:"advance",amount:100 }] } });
  updateOne.mockResolvedValue({ matchedCount:1 });
});
test.each(["100abc", "Infinity", "NaN", -100, 0, "1.001"])("invalid advance %s cannot alter salary through create or update", async amount => {
  const request = { url:"http://localhost/api/attendance?id=advance&empID=0001&month=2026-04", json:async()=>({ empID:"0001",month:"2026-04",amount }) };
  expect((await POST(request)).status).toBe(400);
  expect((await PUT(request)).status).toBe(400);
  expect(updateOne).not.toHaveBeenCalled();
});
test("valid cents are preserved when recording or correcting an advance", async () => {
  const request = { url:"http://localhost/api/attendance?id=advance&empID=0001&month=2026-04", json:async()=>({ empID:"0001",month:"2026-04",amount:"123.45" }) };
  expect((await POST(request)).status).toBe(201);
  expect(updateOne.mock.calls[0][1].$push["advances.2026-04"].amount).toBe(123.45);
  expect((await PUT(request)).status).toBe(200);
  expect(updateOne.mock.calls[1][1].$set["advances.2026-04"][0].amount).toBe(123.45);
});
