import { ObjectId } from "mongodb";
import getDatabase from "@/database/connectToMongoDB";
import { getProcurementStore } from "@/lib/supplier-procurements.mjs";
import { GET as getCustomers } from "@/app/api/customer/route";
import { GET as getSuppliers } from "@/app/api/supplier/route";

jest.mock("@/database/connectToMongoDB", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("@/lib/mutation-auth", () => ({}));
jest.mock("@/lib/supplier-procurements.mjs", () => ({ getProcurementStore: jest.fn() }));

const parties = Array.from({ length: 4 }, () => ({ _id: new ObjectId() }));
const cursor = (rows) => ({ sort: () => cursor(rows), toArray: async () => rows });
const request = (party) => ({ url: `http://localhost/api/${party}?includeDeleteStatus=true` });

test("customer listing disables deletion for orders and active or paused subscriptions", async () => {
  const subscriptions = jest.fn().mockResolvedValue([parties[1]._id]);
  const collections = {
    customers: { find: () => cursor(parties) },
    orders: { distinct: async () => [parties[0]._id] },
    customer_subscriptions: { distinct: subscriptions },
  };
  getDatabase.mockResolvedValue({ collection: (name) => collections[name] });
  const response = await getCustomers(request("customer"));
  expect(response.status).toBe(200);
  expect((await response.json()).map((party) => party.deleteBlockedReason)).toEqual([
    "Customer has existing orders", "Customer has active or paused subscriptions", null, null,
  ]);
  expect(subscriptions).toHaveBeenCalledWith("customerId", expect.objectContaining({
    status: { $in: ["active", "paused"] },
  }));
});

test("supplier listing disables deletion for procurements, commissions, and head supplier links", async () => {
  const collections = {
    suppliers: { find: () => cursor(parties), distinct: async () => [parties[2]._id] },
    head_supplier_entries: { find: () => cursor([{ ...parties[1], entryIds: [new ObjectId()] }, parties[3]]) },
  };
  getDatabase.mockResolvedValue({ collection: (name) => collections[name] });
  getProcurementStore.mockReturnValue({ aggregate: () => cursor([parties[0]]) });
  const response = await getSuppliers(request("supplier"));
  expect(response.status).toBe(200);
  expect((await response.json()).map((party) => party.deleteBlockedReason)).toEqual([
    "Supplier has existing procurements", "Supplier has head commission history", "Supplier belongs to a head supplier", null,
  ]);
});
