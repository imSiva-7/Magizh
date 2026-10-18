import { GET, POST } from "./route";
import getDatabase from "@/database/connectToMongoDB";
import { requireStaff } from "@/lib/mutation-auth";
import { GST_EXPORT_PROFILE, GST_INVOICE_METADATA } from "@/lib/gstr1-prefill.mjs";

jest.mock("@/database/connectToMongoDB", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("@/lib/mutation-auth", () => ({ requireStaff: jest.fn() }));
jest.mock("next/server", () => ({ NextResponse: { json: (data, options) => ({ data, status: options?.status || 200 }) } }));

function database() {
  const orders = [{ _id: "one", customerName: "Shop", date: "2026-10-18", gstRate: 5, totalAmount: 105, items: [{ product: "Curd", quantity: 1, totalAmount: 105 }] }];
  let profile = null;
  const metadata = new Map();
  const update = jest.fn(async (query, values) => { profile = { _id: GST_EXPORT_PROFILE, ...values.$set }; });
  const bulk = jest.fn(async operations => { for (const { updateOne } of operations) metadata.set(updateOne.filter._id, { _id: updateOne.filter._id, ...updateOne.update.$set }); });
  return { orders, update, bulk, collection(name) {
    if (name === "orders") return { aggregate: () => ({ toArray: async () => orders.map(row => ({ ...row })) }) };
    if (name === "settings") return { findOne: async () => profile, updateOne: update };
    if (name === GST_INVOICE_METADATA) return { find: query => ({ toArray: async () => [...metadata.values()].filter(row => query._id.$in.includes(row._id)) }), bulkWrite: bulk };
    throw new Error(`Unexpected collection: ${name}`);
  } };
}
const request = () => ({ url: "http://localhost/api/customer/order/gstr1?month=2026-10" });
beforeEach(() => { jest.clearAllMocks(); requireStaff.mockResolvedValue(null); });

async function exportBody() {
  const { data } = await GET(request());
  return { gstin: data.prefills.gstin, month: "2026-10", hsnDigits: 6, defaultPos: "33", products: { Curd: { hsn: "040310", rate: "5", uqc: "KGS" } }, invoices: { one: { number: "MD/001", gstin: "", pos: "33" } }, fingerprints: data.prefills.fingerprints, reviewed: true };
}
test("confirmed export details are remembered without modifying the orders", async () => {
  const db = database(); getDatabase.mockResolvedValue(db);
  const before = JSON.stringify(db.orders);
  const response = await POST({ json: async () => exportBody() });
  expect(response.status).toBe(200);
  expect(response.data.data.b2cs[0].txval).toBe(100);
  expect(db.update).toHaveBeenCalledTimes(1);
  expect(db.bulk).toHaveBeenCalledTimes(1);
  const again = await GET(request());
  expect(again.data.prefills.products.Curd).toEqual({ hsn: "040310", rate: "5", uqc: "KGS" });
  expect(again.data.prefills.invoices.one).toEqual({ number: "MD/001", gstin: "", pos: "33" });
  expect(JSON.stringify(db.orders)).toBe(before);
});
test("changes since loading the export block saves until the user reloads", async () => {
  const db = database(); getDatabase.mockResolvedValue(db);
  const body = await exportBody(); db.orders[0].totalAmount = 210;
  expect((await POST({ json: async () => body })).status).toBe(409);
  expect(db.update).not.toHaveBeenCalled(); expect(db.bulk).not.toHaveBeenCalled();
});
test("invalid or unreviewed exports cannot become future defaults", async () => {
  const db = database(); getDatabase.mockResolvedValue(db);
  const body = await exportBody();
  expect((await POST({ json: async () => ({ ...body, reviewed: false }) })).status).toBe(400);
  expect((await POST({ json: async () => ({ ...body, defaultPos: "99" }) })).status).toBe(400);
  expect((await POST({ json: async () => ({ ...body, invoices: {} }) })).status).toBe(400);
  expect(db.update).not.toHaveBeenCalled(); expect(db.bulk).not.toHaveBeenCalled();
});
test("authentication is required for both prefills and saved defaults", async () => {
  requireStaff.mockResolvedValue({ status: 401 });
  expect((await GET(request())).status).toBe(401);
  expect((await POST({ json: async () => ({}) })).status).toBe(401);
  expect(getDatabase).not.toHaveBeenCalled();
});
