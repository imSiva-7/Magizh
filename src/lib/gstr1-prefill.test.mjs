import test from "node:test";
import assert from "node:assert/strict";
import { buildGstr1Prefills, invoiceFingerprint } from "./gstr1-prefill.mjs";

const order = (fields = {}) => ({ _id: "one", date: "2026-10-18", customerId: "shop", customerGST: "27AAPFU0939F1ZV", gstRate: 5, totalAmount: 105, items: [{ product: "Curd", quantity: 1, totalAmount: 105 }], ...fields });

test("saved order rates, customer GSTIN, GST state and known units prefill without inventing HSN or invoice numbers", () => {
  const result = buildGstr1Prefills([order()]);
  assert.deepEqual(result.products.Curd, { hsn: "", rate: "5", uqc: "KGS" });
  assert.deepEqual(result.invoices.one, { number: "", gstin: "27AAPFU0939F1ZV", pos: "27" });
});
test("confirmed product details and invoice metadata are reused across exports", () => {
  const row = order();
  const result = buildGstr1Prefills([row], { hsnDigits: 4, products: { Curd: { hsn: "0403", rate: "18", uqc: "KGS" } } }, [{ _id: "one", fingerprint: invoiceFingerprint(row), number: "MD/001", gstin: row.customerGST, pos: "33" }]);
  assert.equal(result.hsnDigits, "4");
  assert.deepEqual(result.products.Curd, { hsn: "0403", rate: "5", uqc: "KGS" });
  assert.equal(result.invoices.one.number, "MD/001");
  assert.equal(result.invoices.one.pos, "33");
});
test("changed invoice source data invalidates previously confirmed invoice metadata", () => {
  const row = order();
  const result = buildGstr1Prefills([order({ totalAmount: 210 })], {}, [{ _id: "one", fingerprint: invoiceFingerprint(row), number: "MD/001", gstin: "", pos: "33" }]);
  assert.equal(result.invoices.one.number, "");
  assert.equal(result.invoices.one.gstin, row.customerGST);
  assert.equal(result.invoices.one.pos, "27");
});
test("unregistered supply states remain blank unless saved or explicitly configured", () => {
  const row = order({ customerGST: "" });
  assert.equal(buildGstr1Prefills([row]).invoices.one.pos, "");
  assert.equal(buildGstr1Prefills([row], { defaultPos: "33" }).invoices.one.pos, "33");
  assert.equal(buildGstr1Prefills([order({ customerGST: "", customerPlaceOfSupply: "29" })], { defaultPos: "33" }).invoices.one.pos, "29");
});
test("conflicting saved rates or HSNs do not silently pick the first invoice", () => {
  const result = buildGstr1Prefills([order(), order({ _id: "two", gstRate: 18 })], { products: { Curd: { hsn: "040310", rate: "5", uqc: "KGS" } } });
  assert.equal(result.products.Curd.rate, "");
  assert.equal(result.conflicts.length, 1);
});
test("saved item classifications take priority over product defaults", () => {
  const result = buildGstr1Prefills([order({ invoiceNumber: "BOOK/2", placeOfSupply: "33", items: [{ product: "Curd", hsn: "040310", gstRate: 12, uqc: "KGS" }] })], { products: { Curd: { hsn: "0403", rate: "5", uqc: "LTR" } } });
  assert.deepEqual(result.products.Curd, { hsn: "040310", rate: "12", uqc: "KGS" });
  assert.equal(result.invoices.one.number, "BOOK/2");
  assert.equal(result.invoices.one.pos, "33");
});
