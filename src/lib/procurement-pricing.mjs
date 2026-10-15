const r2 = (n) => Math.round(n * 100) / 100;
const r4 = (n) => Math.round(n * 10000) / 10000;
const problem = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };

export function validateProcurementInput(body) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date || "")) problem("Invalid procurement date");
  const date = new Date(`${body.date}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== body.date) problem("Invalid procurement date");
  if (!["AM", "PM"].includes(body.time)) problem("Time must be AM or PM");
  for (const field of ["milkQuantity", "fatPercentage", "snfPercentage"]) {
    if (!Number.isFinite(Number(body[field])) || Number(body[field]) <= 0) problem(`Invalid ${field}`);
  }
  if (body.paymentStatus !== undefined) validatePaymentStatus(body.paymentStatus);
  return { date: body.date, time: body.time, milkQuantity: Number(body.milkQuantity), fatPercentage: Number(body.fatPercentage), snfPercentage: Number(body.snfPercentage) };
}
export function validatePaymentStatus(status) {
  if (!["Paid", "Not Paid"].includes(status)) problem("Status must be Paid or Not Paid");
}
export function priceProcurement(input, snapshot) {
  const customRate = Boolean(snapshot.customRate);
  const parentTsr = Number(snapshot.parentTsr);
  const cutPercentage = Number(snapshot.cutPercentage || 0);
  const supplierTSRate = Number(snapshot.supplierTSRate);
  const rate = customRate ? Number(snapshot.rate) : (input.fatPercentage + input.snfPercentage) * supplierTSRate / 100;
  if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(parentTsr) || parentTsr <= 0 || !Number.isFinite(cutPercentage) || cutPercentage < 0 || cutPercentage >= parentTsr) problem("Invalid saved supplier rate; review this procurement before editing", 409);
  return { ...input, customRate, parentTsr: r4(parentTsr), cutPercentage: r4(cutPercentage), supplierTSRate: r4(supplierTSRate), rate: r4(rate), totalAmount: r2(rate * input.milkQuantity) };
}
export function supplierPricingSnapshot(supplier) {
  const parentTsr = Number(supplier.supplierTSRate);
  const customRate = supplier.supplierCustomRate !== undefined && supplier.supplierCustomRate !== null && supplier.supplierCustomRate !== "" && Number(supplier.supplierCustomRate) !== 0;
  const cutPercentage = supplier.isChildSupplier && supplier.headSupplierId && !customRate ? Number(supplier.cutPercentage || 0) : 0;
  if (!Number.isFinite(parentTsr) || parentTsr <= 0 || !Number.isFinite(cutPercentage) || cutPercentage < 0 || cutPercentage >= parentTsr || (customRate && (!Number.isFinite(Number(supplier.supplierCustomRate)) || Number(supplier.supplierCustomRate) <= 0))) problem("Invalid supplier rate or TS rate deduction");
  return { customRate, parentTsr, cutPercentage, supplierTSRate: parentTsr - cutPercentage, rate: customRate ? Number(supplier.supplierCustomRate) : undefined };
}
export function historicalPricingSnapshot(procurement) {
  const cutPercentage = Number(procurement.cutPercentage || 0);
  const supplierTSRate = Number(procurement.supplierTSRate ?? (Number(procurement.parentTsr) - cutPercentage));
  return { customRate: Boolean(procurement.customRate), rate: procurement.rate, cutPercentage, supplierTSRate, parentTsr: Number(procurement.parentTsr ?? (supplierTSRate + cutPercentage)) };
}
