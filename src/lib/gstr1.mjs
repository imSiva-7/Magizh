const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
const validStates = new Set(["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "26", "27", "29", "30", "31", "32", "33", "34", "35", "36", "37", "38", "97"]);
const fail = message => { throw new Error(message); };
export const validSupplyState = value => validStates.has(value);
export function validGstin(value) {
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(value) || !validStates.has(value.slice(0, 2))) return false;
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let sum = 0;
  for (let index = 0; index < 14; index++) {
    const product = alphabet.indexOf(value[index]) * (index % 2 ? 2 : 1);
    sum += Math.floor(product / 36) + product % 36;
  }
  return alphabet[(36 - sum % 36) % 36] === value[14];
}

// Export regular domestic taxable sales. Each order must represent an issued
// invoice; invoice numbers and tax classifications come from the user's records.
export function buildGstr1({ gstin, month, orders, products, invoices, hsnDigits = 6 }) {
  gstin = gstin.trim().toUpperCase();
  if (!validGstin(gstin)) fail("Enter a valid supplier GSTIN, including its check digit.");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month < "2025-05") fail("Choose a return month from May 2025 onwards.");
  if (![4, 6].includes(Number(hsnDigits))) fail("Choose a 4- or 6-digit minimum HSN length.");
  if (!orders.length) fail("No orders found for this return month.");
  const result = { gstin, fp: month.slice(5) + month.slice(0, 4), version: "GST3.2.4", hash: "hash" };
  const b2b = new Map(), b2cl = new Map(), b2cs = new Map(), hsn = { hsn_b2b: new Map(), hsn_b2c: new Map() }, numbers = new Set();
  const add = (map, key, initial, amounts) => {
    const row = map.get(key) || { ...initial };
    for (const [field, value] of Object.entries(amounts)) row[field] = field === "qty" ? Math.round(((row[field] || 0) + value) * 1000) / 1000 : round((row[field] || 0) + value);
    map.set(key, row);
  };
  for (const order of orders) {
    const meta = invoices[String(order._id)] || {};
    const name = order.customerName || "Customer";
    const inum = (meta.number || "").trim();
    const ctin = (meta.gstin || "").trim().toUpperCase();
    const pos = meta.pos;
    if (!/^[A-Za-z0-9/-]{1,16}$/.test(inum)) fail(`${name}: enter the actual invoice number (up to 16 letters, digits, / or -).`);
    if (numbers.has(inum.toUpperCase())) fail(`Duplicate invoice number: ${inum}.`);
    numbers.add(inum.toUpperCase());
    if (ctin && (!validGstin(ctin) || ctin === gstin)) fail(`${inum}: enter a valid customer GSTIN, different from the supplier GSTIN.`);
    if (!validStates.has(pos)) fail(`${inum}: confirm the two-digit place-of-supply state code.`);
    const date = new Date(`${order.date}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== order.date || !order.date.startsWith(`${month}-`)) fail(`${inum}: invoice date must fall within the return month.`);
    const interstate = pos !== gstin.slice(0, 2);
    const rates = new Map();
    let grossTotal = 0;
    if (!order.items?.length) fail(`${inum}: no invoice items found.`);
    for (const item of order.items) {
      const config = products[item.product] || {};
      const code = (config.hsn || "").trim();
      const rate = Number(config.rate);
      const gross = Number(item.totalAmount), quantity = Number(item.quantity);
      if (!/^\d{4}(?:\d{2}){0,2}$/.test(code) || code.length < Number(hsnDigits)) fail(`${item.product}: enter a valid HSN with at least ${hsnDigits} digits.`);
      if (!Number.isFinite(rate) || rate <= 0 || rate > 40 || String(config.rate).trim() === "") fail(`${item.product}: confirm the taxable GST rate (greater than 0, up to 40%). Exempt and nil-rated sales need a separate return section.`);
      if (!["KGS", "LTR"].includes(config.uqc)) fail(`${item.product}: choose KGS or LTR.`);
      if (!Number.isFinite(gross) || gross <= 0 || !Number.isFinite(quantity) || quantity <= 0) fail(`${inum}: item amounts and quantities must be positive.`);
      grossTotal += gross;
      // Stored line totals already include GST in both order entry flows.
      const txval = round(gross / (1 + rate / 100));
      const tax = round(gross - txval);
      const iamt = interstate ? tax : 0;
      const camt = interstate ? 0 : round(tax / 2);
      const samt = interstate ? 0 : round(tax - camt);
      const amounts = interstate ? { txval, iamt, csamt: 0 } : { txval, camt, samt, csamt: 0 };
      add(rates, rate, { rt: rate }, amounts);
      add(hsn[ctin ? "hsn_b2b" : "hsn_b2c"], `${code}:${config.uqc}:${rate}`, { hsn_sc: code, desc: item.product, uqc: config.uqc, rt: rate }, { ...amounts, qty: quantity });
    }
    const value = round(Number(order.totalAmount));
    if (!Number.isFinite(value) || Math.abs(round(grossTotal) - value) > .02) fail(`${inum}: line totals do not match the saved invoice total. Correct the order before exporting.`);
    const invoice = { inum, idt: `${order.date.slice(8)}-${order.date.slice(5, 7)}-${order.date.slice(0, 4)}`, val: value, itms: [...rates.values()].map((details, index) => ({ num: index + 1, itm_det: details })) };
    if (ctin) {
      const group = b2b.get(ctin) || { ctin, inv: [] };
      group.inv.push({ ...invoice, pos, rchrg: "N", inv_typ: "R" }); b2b.set(ctin, group);
    } else if (interstate && value > 100000) {
      const group = b2cl.get(pos) || { pos, inv: [] };
      group.inv.push(invoice); b2cl.set(pos, group);
    } else {
      for (const details of rates.values()) {
        const { rt, ...amounts } = details;
        add(b2cs, `${pos}:${rt}`, { sply_ty: interstate ? "INTER" : "INTRA", typ: "OE", pos, rt }, amounts);
      }
    }
  }
  if (b2b.size) result.b2b = [...b2b.values()];
  if (b2cl.size) result.b2cl = [...b2cl.values()];
  if (b2cs.size) result.b2cs = [...b2cs.values()];
  result.hsn = Object.fromEntries(Object.entries(hsn).filter(([, rows]) => rows.size).map(([type, rows]) => [type, [...rows.values()].map((row, index) => ({ num: index + 1, ...row }))]));
  return result;
}
