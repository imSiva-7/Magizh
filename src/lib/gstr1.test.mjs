import test from "node:test";
import assert from "node:assert/strict";
import { buildGstr1, validGstin } from "./gstr1.mjs";

const seller = "33ACBFM9128J1Z4";
const buyer = "27AAPFU0939F1ZV";
const order = (id = "one", total = 105) => ({ _id: id, customerName: "Shop", date: "2026-10-18", totalAmount: total, items: [{ product: "Curd", totalAmount: total, quantity: 1 }] });
const options = (overrides = {}) => ({ gstin: seller, month: "2026-10", hsnDigits: 4, orders: [order()], products: { Curd: { hsn: "0403", rate: "5", uqc: "KGS" } }, invoices: { one: { number: "MD/001", gstin: "", pos: "33" } }, ...overrides });

test("GSTIN check digit rejects structurally plausible mistakes", () => {
  assert.equal(validGstin(seller), true);
  assert.equal(validGstin(buyer), true);
  assert.equal(validGstin(seller.slice(0, -1) + "5"), false);
});
test("intra-state consumer sales aggregate by state and rate with B2C HSN", () => {
  const data = buildGstr1(options({ orders: [order(), order("two")], invoices: { one: { number: "MD/001", pos: "33" }, two: { number: "MD/002", pos: "33" } } }));
  assert.equal(data.fp, "102026");
  assert.equal(data.hash, "hash");
  assert.deepEqual(data.b2cs, [{ sply_ty: "INTRA", typ: "OE", pos: "33", rt: 5, txval: 200, camt: 5, samt: 5, csamt: 0 }]);
  assert.equal(data.hsn.hsn_b2c[0].qty, 2);
  assert.equal(data.hsn.hsn_b2c[0].desc, "Curd");
  assert.equal(data.b2b, undefined);
});
test("registered interstate invoice uses IGST and B2B HSN", () => {
  const data = buildGstr1(options({ invoices: { one: { number: "MD/001", gstin: buyer, pos: "27" } } }));
  assert.equal(data.b2b[0].ctin, buyer);
  const invoice = data.b2b[0].inv[0];
  assert.equal(invoice.idt, "18-10-2026");
  assert.deepEqual(invoice.itms[0].itm_det, { rt: 5, txval: 100, iamt: 5, csamt: 0 });
  assert.equal(data.hsn.hsn_b2b[0].txval, 100);
});
test("unregistered interstate invoice above one lakh is B2CL; boundary is B2CS", () => {
  const invoices = { one: { number: "MD/001", pos: "27" } };
  assert.ok(buildGstr1(options({ orders: [order("one", 100001)], invoices })).b2cl);
  assert.ok(buildGstr1(options({ orders: [order("one", 100000)], invoices })).b2cs);
});
test("rounding preserves invoice amount across taxable value and tax", () => {
  const data = buildGstr1(options({ orders: [order("one", 100)] }));
  const row = data.b2cs[0];
  assert.equal(Math.round((row.txval + row.camt + row.samt) * 100), 10000);
});
test("missing metadata, duplicate numbers, wrong month and inconsistent totals block downloads", () => {
  assert.throws(() => buildGstr1(options({ invoices: {} })), /actual invoice number/);
  assert.throws(() => buildGstr1(options({ invoices: { one: { number: "MD/001", pos: "99" } } })), /place-of-supply/);
  assert.throws(() => buildGstr1(options({ products: { Curd: { hsn: "", rate: "5", uqc: "KGS" } } })), /valid HSN/);
  assert.throws(() => buildGstr1(options({ products: { Curd: { hsn: "0403", rate: "", uqc: "KGS" } } })), /GST rate/);
  assert.throws(() => buildGstr1(options({ hsnDigits: 6 })), /at least 6/);
  assert.throws(() => buildGstr1(options({ orders: [order(), order("two")], invoices: { one: { number: "MD/001", pos: "33" }, two: { number: "md/001", pos: "33" } } })), /Duplicate/);
  assert.throws(() => buildGstr1(options({ month: "2026-09" })), /within the return month/);
  assert.throws(() => buildGstr1(options({ orders: [{ ...order(), totalAmount: 104 }] })), /do not match/);
});
