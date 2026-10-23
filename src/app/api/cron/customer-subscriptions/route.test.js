import { GET } from "./route";
import getDatabase from "@/database/connectToMongoDB";
import { generateDueSubscriptions } from "@/lib/customer-subscriptions";
jest.mock("@/database/connectToMongoDB", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("@/lib/customer-subscriptions", () => ({ generateDueSubscriptions: jest.fn() }));
jest.mock("@/lib/india-date.mjs", () => ({ getTodayDate: () => "2026-10-23" }));
const originalSecret = process.env.CRON_SECRET;
beforeEach(() => { jest.clearAllMocks(); process.env.CRON_SECRET = "test-secret"; getDatabase.mockResolvedValue({}); });
afterAll(() => { if (originalSecret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = originalSecret; });
const request = token => new Request("https://example.test/api/cron/customer-subscriptions", { headers: token ? { authorization: token } : {} });
test("cron is disabled without a secret", async () => {
  delete process.env.CRON_SECRET;
  expect((await GET(request())).status).toBe(503); expect(getDatabase).not.toHaveBeenCalled();
});
test.each([undefined, "Bearer wrong", "Bearer test-secreu"])("cron rejects invalid authentication %s", async token => {
  expect((await GET(request(token))).status).toBe(401); expect(getDatabase).not.toHaveBeenCalled();
});
test("valid scheduler credentials generate due orders using India date", async () => {
  generateDueSubscriptions.mockResolvedValue({ created: 1, errors: [] });
  expect((await GET(request("Bearer test-secret"))).status).toBe(200);
  expect(generateDueSubscriptions).toHaveBeenCalledWith({}, "2026-10-23");
});
