import { ObjectId } from "mongodb";
import { withCustomerTransaction } from "@/lib/customer-transaction.mjs";
import { createCustomerOrder } from "@/lib/customer-order-write";
import { nextDate, scheduledOn, subscriptionOrder } from "@/lib/customer-subscription-rules";

// A durable run ID survives order deletion; retries must never recreate a delivery.
export async function generateSubscriptionDate(database, id, today) {
  return withCustomerTransaction(database, async db => {
    const subscriptions = db.collection("customer_subscriptions");
    const subscription = await subscriptions.findOne({ _id: new ObjectId(id) });
    if (!subscription || subscription.status !== "active" || subscription.nextDate > today) return { outcome: "idle" };
    const date = subscription.nextDate;
    if (subscription.endDate && date > subscription.endDate) {
      await subscriptions.updateOne({ _id: subscription._id }, { $set: { status: "completed", updatedAt: new Date() } });
      return { outcome: "idle" };
    }
    const key = `${subscription._id}:${date}`;
    const prior = await db.collection("subscription_runs").findOne({ _id: key });
    let orderId = prior?.orderId || null;
    let outcome = "skipped";
    if (!prior && scheduledOn(subscription, date)) {
      const customer = await db.collection("customers").findOne({ _id: subscription.customerId });
      if (!customer) throw new Error("Customer no longer exists; cancel this subscription");
      // Claim and order/stock/balance writes commit together, or all roll back.
      await db.collection("subscription_runs").insertOne({ _id: key, subscriptionId: subscription._id, date, createdAt: new Date() });
      const response = await createCustomerOrder(db, subscriptionOrder(subscription, customer, date), { subscriptionId: subscription._id, subscriptionDate: date });
      const result = await response.json();
      if (response.status >= 400) throw new Error(result.error || "Could not create subscription order");
      orderId = new ObjectId(result._id);
      await db.collection("subscription_runs").updateOne({ _id: key }, { $set: { orderId } });
      outcome = "created";
    } else if (prior) outcome = "existing";
    const followingDate = nextDate(date);
    // Writing the subscription also serializes pause/skip against generation.
    await subscriptions.updateOne({ _id: subscription._id }, { $set: {
      nextDate: followingDate, updatedAt: new Date(), lastError: null,
      ...(orderId ? { lastOrderDate: date, lastOrderId: orderId } : {}),
      ...(subscription.endDate && followingDate > subscription.endDate ? { status: "completed" } : {}),
    } });
    return { outcome, date, orderId };
  });
}

export async function generateDueSubscriptions(db, today, customerId) {
  const query = { status: "active", nextDate: { $lte: today }, ...(customerId ? { customerId: new ObjectId(customerId) } : {}) };
  const subscriptions = await db.collection("customer_subscriptions").find(query).sort({ nextDate: 1, _id: 1 }).limit(50).toArray();
  const result = { created: 0, skipped: 0, existing: 0, errors: [] };
  // Bound catch-up work per request; the cursor advances only with committed work.
  let remaining = 100;
  for (const subscription of subscriptions) {
    for (let day = 0; day < 31 && remaining > 0; day++, remaining--) {
      try {
        const generated = await generateSubscriptionDate(db, subscription._id, today);
        if (generated.outcome === "idle") break;
        result[generated.outcome]++;
      } catch (error) {
        // A concurrent run won the unique claim. Its cursor will be re-read next run.
        if (error.code === 11000) break;
        const message = error.message || "Could not generate order";
        result.errors.push({ subscriptionId: String(subscription._id), customerName: subscription.customerName, error: message });
        await db.collection("customer_subscriptions").updateOne({ _id: subscription._id }, { $set: { lastError: message, updatedAt: new Date() } });
        break;
      }
    }
  }
  result.remaining = await db.collection("customer_subscriptions").countDocuments(query);
  return result;
}
