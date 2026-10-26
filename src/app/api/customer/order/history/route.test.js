import { GET } from "./route";
import { getServerSession } from "next-auth";
import clientPromise from "@/lib/mongodb";

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));
jest.mock("@/lib/mongodb", () => ({ __esModule: true, default: Promise.resolve({ db: jest.fn() }) }));

test.each(["employee", "dev", "admin"])("%s receives order records, only admins receive the summary", async role => {
  getServerSession.mockResolvedValue({ user: { role } });
  const orders = [{ _id: "order-1", totalAmount: 100 }];
  const summary = { totalAmount: 100, orderCount: 1 };
  (await clientPromise).db.mockReturnValue({ collection: () => ({ aggregate: () => ({ toArray: async () => [{ orders, summary: [summary] }] }) }) });
  const response = await GET({ url: "http://localhost/api/customer/order/history" });
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data.orders).toEqual(orders);
  expect(data.summary).toEqual(role === "admin" ? summary : undefined);
});

test("anonymous callers cannot read order history", async () => {
  getServerSession.mockResolvedValue(null);
  expect((await GET({ url: "http://localhost/api/customer/order/history" })).status).toBe(401);
});
