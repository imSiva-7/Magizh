import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import getDatabase from "@/database/connectToMongoDB";
import { requireAdmin, requireStaff } from "@/lib/mutation-auth";
import { getTodayDate } from "@/lib/india-date.mjs";
import { subscriptionFields, validDate } from "@/lib/customer-subscription-rules";
import { withCustomerTransaction } from "@/lib/customer-transaction.mjs";

const fail = (error, status = 400) => NextResponse.json({ error }, { status });
export async function GET(request) {
  const denied = await requireStaff(); if (denied) return denied;
  const customerId = new URL(request.url).searchParams.get("customerId");
  if (customerId && !ObjectId.isValid(customerId)) return fail("Invalid customer");
  try {
    const db = await getDatabase();
    const subscriptions = await db.collection("customer_subscriptions").find(customerId ? { customerId: new ObjectId(customerId) } : {}).sort({ createdAt: -1 }).toArray();
    return NextResponse.json({ subscriptions, automationConfigured: Boolean(process.env.CRON_SECRET) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return fail("Could not load subscriptions", 500); }
}

export async function POST(request) {
  const denied = await requireStaff(); if (denied) return denied;
  let data, fields;
  try {
    data = await request.json();
    if (!ObjectId.isValid(data.customerId)) return fail("Select a customer");
    fields = subscriptionFields(data, getTodayDate());
  } catch (error) { return fail(error.message); }
  try {
    const db = await getDatabase();
    const customer = await db.collection("customers").findOne({ _id: new ObjectId(data.customerId) });
    if (!customer) return fail("Customer not found", 404);
    const document = { ...fields, customerId: customer._id, customerName: customer.customerName,
      status: "active", nextDate: fields.startDate, skipDates: [], createdAt: new Date(), updatedAt: new Date() };
    const result = await db.collection("customer_subscriptions").insertOne(document);
    return NextResponse.json({ ...document, _id: result.insertedId }, { status: 201 });
  } catch { return fail("Could not create subscription", 500); }
}

export async function PATCH(request) {
  const denied = await requireAdmin(); if (denied) return denied;
  let data;
  try { data = await request.json(); } catch { return fail("Invalid request"); }
  if (!ObjectId.isValid(data.id) || !["pause", "resume", "cancel", "skip", "unskip"].includes(data.action)) return fail("Invalid subscription action");
  const today = getTodayDate();
  if (["skip", "unskip"].includes(data.action) && (!validDate(data.date) || data.date < today)) return fail("Choose today or a future date to skip");
  try {
    const database = await getDatabase();
    return await withCustomerTransaction(database, async db => {
      const collection = db.collection("customer_subscriptions");
      const subscription = await collection.findOne({ _id: new ObjectId(data.id) });
      if (!subscription) return fail("Subscription not found", 404);
      if (["cancelled", "completed"].includes(subscription.status)) return fail("This subscription has ended");
      const changes = { updatedAt: new Date() };
      if (data.action === "pause") changes.status = "paused";
      if (data.action === "cancel") changes.status = "cancelled";
      if (data.action === "resume") {
        if (subscription.status !== "paused") return fail("Only paused subscriptions can resume");
        if (subscription.endDate && subscription.endDate < today) return fail("The end date has passed; create a new subscription");
        changes.status = "active";
        changes.nextDate = [subscription.nextDate, subscription.startDate, today].sort().at(-1);
      }
      if (["skip", "unskip"].includes(data.action)) {
        if (data.date < subscription.nextDate) return fail("This date has already been processed. Edit deliveries in Orders.", 409);
        if (data.date < subscription.startDate || (subscription.endDate && data.date > subscription.endDate)) return fail("Date is outside the subscription period");
        if (await db.collection("subscription_runs").findOne({ _id: `${subscription._id}:${data.date}` })) return fail("An order already exists for this date. Edit it in Orders.", 409);
        const dates = new Set(subscription.skipDates || []);
        if (data.action === "skip") dates.add(data.date); else dates.delete(data.date);
        if (dates.size > 366) return fail("Too many skipped dates");
        changes.skipDates = [...dates].sort();
      }
      await collection.updateOne({ _id: subscription._id }, { $set: changes });
      return NextResponse.json({ message: "Subscription updated" });
    });
  } catch { return fail("Could not update subscription", 500); }
}
