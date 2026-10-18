import { createHash } from "node:crypto";
import { validGstin } from "./gstr1.mjs";

export const GST_EXPORT_PROFILE = "gstr1_export";
export const GST_INVOICE_METADATA = "gstr1_invoice_metadata";

export function invoiceFingerprint(order) {
  return createHash("sha256").update(JSON.stringify({ id: String(order._id), customerId: String(order.customerId || ""), date: order.date, totalAmount: order.totalAmount, items: order.items, gstRate: order.gstRate, customerGST: order.customerGST || "", invoiceNumber: order.invoiceNumber || "", placeOfSupply: order.placeOfSupply || "", customerPlaceOfSupply: order.customerPlaceOfSupply || "" })).digest("hex");
}

const text = value => value == null ? "" : String(value).trim();
const unique = values => [...new Set(values.filter(value => value !== ""))];

export function buildGstr1Prefills(orders, profile = {}, savedInvoices = []) {
  const saved = new Map(savedInvoices.map(row => [String(row._id), row]));
  const sources = new Map();
  const invoices = {}, fingerprints = {}, conflicts = [];
  for (const order of orders) {
    const id = String(order._id);
    const fingerprint = invoiceFingerprint(order);
    fingerprints[id] = fingerprint;
    const previous = saved.get(id);
    const confirmed = previous?.fingerprint === fingerprint ? previous : {};
    const gstin = text(confirmed.gstin ?? order.customerGST).toUpperCase();
    invoices[id] = {
      number: text(order.invoiceNumber || confirmed.number),
      gstin,
      pos: text(order.placeOfSupply || confirmed.pos || order.customerPlaceOfSupply || (validGstin(gstin) ? gstin.slice(0, 2) : "") || (!gstin ? profile.defaultPos : "")),
    };
    for (const item of order.items || []) {
      const source = sources.get(item.product) || { hsn: [], rate: [], uqc: [] };
      source.hsn.push(text(item.hsn || item.hsnCode));
      const rate = item.gstRate ?? order.gstRate;
      source.rate.push(rate !== null && rate !== undefined && text(rate) !== "" && Number.isFinite(Number(rate)) ? String(Number(rate)) : "");
      source.uqc.push(text(item.uqc));
      sources.set(item.product, source);
    }
  }
  const products = Object.fromEntries([...sources].map(([name, source]) => {
    const previous = Object.hasOwn(profile.products || {}, name) ? profile.products[name] : {};
    const config = {};
    for (const field of ["hsn", "rate", "uqc"]) {
      const values = unique(source[field]);
      if (values.length > 1) { config[field] = ""; conflicts.push(`${name}: saved orders have different ${field === "rate" ? "GST rates" : field.toUpperCase() + " values"}. Review the invoices before choosing a value.`); }
      else config[field] = values[0] ?? text(previous[field]);
    }
    if (!config.uqc && !unique(source.uqc).length) config.uqc = ["Milk", "Ghee"].includes(name) ? "LTR" : "KGS";
    return [name, config];
  }));
  return { gstin: text(profile.gstin) || "33ACBFM9128J1Z4", hsnDigits: Number(profile.hsnDigits) === 4 ? "4" : "6", defaultPos: text(profile.defaultPos), products, invoices, fingerprints, conflicts };
}
