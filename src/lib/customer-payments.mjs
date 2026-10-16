export function moneyCents(value) {
  const text = String(value ?? "").trim();
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(text)) throw new Error("Enter an amount with at most two decimal places");
  const cents = Math.round(Number(text) * 100);
  if (!Number.isSafeInteger(cents)) throw new Error("Amount is too large");
  return cents;
}

export function paymentBalance(totalAmount, paidAmount, change) {
  // Existing totals can contain floating point noise from older order updates.
  const total = Math.round(Number(totalAmount || 0) * 100);
  const paid = Math.round(Number(paidAmount || 0) * 100) + moneyCents(change);
  if (![total, paid].every(Number.isSafeInteger)) throw new Error("Balance is outside the supported range");
  if (paid < 0) throw new Error("Total received cannot be negative");
  return { paidAmount: paid / 100, dueAmount: (total - paid) / 100 };
}

export function accountStatus(totalAmount, paidAmount) {
  const due = Math.round((Number(totalAmount || 0) - Number(paidAmount || 0)) * 100);
  if (due < 0) return "Credit";
  if (due === 0) return "Settled";
  return Number(paidAmount) > 0 ? "Part paid" : "Unpaid";
}
