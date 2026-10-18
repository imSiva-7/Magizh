import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/mutation-auth";
import getDatabase from "@/database/connectToMongoDB";
import { buildGstr1, validSupplyState } from "@/lib/gstr1.mjs";
import { buildGstr1Prefills, invoiceFingerprint, GST_EXPORT_PROFILE, GST_INVOICE_METADATA } from "@/lib/gstr1-prefill.mjs";

const validMonth = month => /^\d{4}-(0[1-9]|1[0-2])$/.test(month || "") && month >= "2025-05";

async function monthlyOrders(db, month) {
  return db.collection("orders").aggregate([
    { $match: { date: { $gte: `${month}-01`, $lte: `${month}-31` } } },
    { $sort: { date: 1, createdAt: 1, _id: 1 } },
    { $lookup: { from: "customers", localField: "customerId", foreignField: "_id", as: "customer" } },
    { $project: { _id: { $toString: "$_id" }, customerId: { $toString: "$customerId" }, customerName: 1, date: 1, items: 1, totalAmount: 1, gstRate: 1, invoiceNumber: 1, customerGST: { $ifNull: ["$customerGST", { $arrayElemAt: ["$customer.customerGST", 0] }] }, placeOfSupply: 1, customerPlaceOfSupply: { $arrayElemAt: ["$customer.placeOfSupply", 0] } } },
  ]).toArray();
}

export async function GET(request) {
  const denied = await requireStaff();
  if (denied) return denied;
  const month = new URL(request.url).searchParams.get("month");
  if (!validMonth(month)) return NextResponse.json({ error: "Choose a return month from May 2025 onwards." }, { status: 400 });
  try {
    const db = await getDatabase();
    const [orders, profile] = await Promise.all([monthlyOrders(db, month), db.collection("settings").findOne({ _id: GST_EXPORT_PROFILE })]);
    const saved = orders.length ? await db.collection(GST_INVOICE_METADATA).find({ _id: { $in: orders.map(order => String(order._id)) } }).toArray() : [];
    return NextResponse.json({ orders, prefills: buildGstr1Prefills(orders, profile || {}, saved) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GSTR-1 export data failed", error);
    return NextResponse.json({ error: "Could not load monthly orders. Please retry." }, { status: 500 });
  }
}

export async function POST(request) {
  const denied = await requireStaff();
  if (denied) return denied;
  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid export details." }, { status: 400 }); }
  if (!body || !validMonth(body.month) || body.reviewed !== true) return NextResponse.json({ error: "Choose a return month and review the export details first." }, { status: 400 });
  try {
    const db = await getDatabase();
    const orders = await monthlyOrders(db, body.month);
    if (Object.keys(body.fingerprints || {}).length !== orders.length || orders.some(order => body.fingerprints?.[String(order._id)] !== invoiceFingerprint(order))) return NextResponse.json({ error: "Orders or customer details changed. Reload the month and review the prefills before exporting." }, { status: 409 });
    let data;
    try {
      data = buildGstr1({ gstin: body.gstin, month: body.month, orders, products: body.products || {}, invoices: body.invoices || {}, hsnDigits: body.hsnDigits });
      if (body.defaultPos && !validSupplyState(body.defaultPos)) throw new Error("Default place of supply must be a valid two-digit state code.");
    } catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }); }
    const previous = await db.collection("settings").findOne({ _id: GST_EXPORT_PROFILE });
    const products = Object.fromEntries([...new Set(orders.flatMap(order => order.items.map(item => item.product)))].map(name => [name, { hsn: String(body.products[name].hsn).trim(), rate: String(Number(body.products[name].rate)), uqc: body.products[name].uqc }]));
    const now = new Date();
    // Export preferences are separate from business records. Saving these does
    // not renumber invoices, alter orders, or change customer tax details.
    await db.collection("settings").updateOne({ _id: GST_EXPORT_PROFILE }, { $set: { gstin: data.gstin, hsnDigits: Number(body.hsnDigits), defaultPos: body.defaultPos || "", products: { ...previous?.products, ...products }, updatedAt: now } }, { upsert: true });
    await db.collection(GST_INVOICE_METADATA).bulkWrite(orders.map(order => ({ updateOne: { filter: { _id: String(order._id) }, update: { $set: { fingerprint: invoiceFingerprint(order), number: body.invoices[order._id].number.trim(), gstin: (body.invoices[order._id].gstin || "").trim().toUpperCase(), pos: body.invoices[order._id].pos, updatedAt: now } }, upsert: true } })));
    return NextResponse.json({ data, saved: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GSTR-1 export preferences failed", error);
    return NextResponse.json({ error: "Could not save export details. Your entries are still available; please retry." }, { status: 500 });
  }
}
