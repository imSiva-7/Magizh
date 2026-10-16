// Keep orders, stock, account balances and chart summaries in one commit.
export async function withCustomerTransaction(db, action) {
  const session = db.client.startSession();
  const positions = { find: 1, findOne: 1, aggregate: 1, countDocuments: 1, insertOne: 1, insertMany: 1, deleteOne: 1, updateOne: 2, updateMany: 2, replaceOne: 2 };
  const scoped = { collection(name) {
    const collection = db.collection(name);
    return new Proxy(collection, { get(target, property) {
      if (property in positions) return (...args) => {
        const index = positions[property];
        args[index] = { ...args[index], session };
        return target[property](...args);
      };
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    } });
  } };
  try {
    return await session.withTransaction(async () => {
      const response = await action(scoped);
      // Validation responses must roll back any writes made before the check.
      if (response?.status >= 400) throw Object.assign(new Error("Customer mutation rejected"), { response });
      return response;
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
  } catch (error) {
    if (error.response) return error.response;
    throw error;
  } finally { await session.endSession(); }
}
