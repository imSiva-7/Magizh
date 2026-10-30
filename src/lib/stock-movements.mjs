// Stock uses the same four decimal places as product quantity summaries.
export const roundStockQuantity = value => Math.round((Number(value) + Number.EPSILON) * 10000) / 10000;

// Call only with a transaction-scoped database so the ledger and balance commit
// together. Reading before writing also makes concurrent changes retry safely.
export async function applyStockMovement(db, entries, deltas) {
  if (!entries.length) return;
  const current = await db.collection("stock_balance").findOne({ _id: "current" });
  const next = { updatedAt: new Date() };
  for (const [field, delta] of Object.entries(deltas)) {
    const balance = Number(current?.[field] ?? 0);
    if (!Number.isFinite(balance) || !Number.isFinite(delta)) throw new Error("Stock contains an invalid quantity");
    next[field] = roundStockQuantity(balance + delta);
  }
  await db.collection("stock_ledger").insertMany(entries.map(entry => ({ ...entry, quantity: roundStockQuantity(entry.quantity) })));
  await db.collection("stock_balance").updateOne(
    { _id: "current" }, { $set: next }, { upsert: true },
  );
}
