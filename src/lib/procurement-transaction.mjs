export const STORAGE_CONTROL = "app_storage";
export const STORAGE_KEY = "procurements";

export async function withProcurementTransaction(db, action, { maintenance = false } = {}) {
  if (db.transactionSession) return action(db);
  const session = db.client.startSession();
  const optionIndex = { find: 1, findOne: 1, aggregate: 1, countDocuments: 1, insertOne: 1, deleteOne: 1, updateOne: 2, updateMany: 2, replaceOne: 2, bulkWrite: 1 };
  const scoped = { transactionSession: session, collection(name) {
    const collection = db.collection(name);
    return new Proxy(collection, { get(target, property) {
      if (property in optionIndex) return (...args) => {
        const index = optionIndex[property];
        args[index] = { ...args[index], session };
        return target[property](...args);
      };
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    } });
  } };
  try {
    return await session.withTransaction(async () => {
      if (!maintenance) {
        const control = await scoped.collection(STORAGE_CONTROL).findOne({ _id: STORAGE_KEY });
        const mode = process.env.PROCUREMENTS_STORAGE || "legacy";
        if (control?.paused || (control?.mode && control.mode !== mode)) throw Object.assign(new Error("Procurement storage is being updated; please retry shortly"), { status: 503 });
      }
      return action(scoped);
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
  } finally { await session.endSession(); }
}
