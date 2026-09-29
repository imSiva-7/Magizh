import { NextResponse } from "next/server";
import getDatabase from "@/database/connectToMongoDB";
import { ObjectId } from "mongodb";

const PROCUREMENTS = "procurements";
const SUPPLIERS = "suppliers";
const HEAD_ENTRIES = "head_supplier_entries";

// --- Helpers ---
const validateObjectId = (id) =>
  id && ObjectId.isValid(id)
    ? { valid: true }
    : { valid: false, error: "Invalid ID format" };

const r2 = (n) => Math.round(n * 100) / 100;
const r4 = (n) => Math.round(n * 10000) / 10000;

const computeTsPricing = (fat, snf, tsr, qty) => {
  const totalSolids = fat + snf;
  const ratePerLiter = (totalSolids * tsr) / 100;
  return { totalSolids, ratePerLiter, totalAmount: ratePerLiter * qty };
};

const validateProcurementData = (d) => {
  for (const f of ["date", "time", "milkQuantity", "fatPercentage", "snfPercentage"]) {
    if (!d[f]) return { valid: false, error: `Missing: ${f}` };
  }
  for (const f of ["milkQuantity", "fatPercentage", "snfPercentage"]) {
    const v = parseFloat(d[f]);
    if (isNaN(v) || v <= 0) return { valid: false, error: `Invalid ${f}` };
  }
  if (!["AM", "PM"].includes(d.time)) {
    return { valid: false, error: "Time must be AM or PM" };
  }
  return { valid: true };
};

/**
 * Atomically mutate a head's entry doc.
 * op = { type: "set" | "unset", path, entry }
 * Also keeps `byProcurement` and `totals` in sync.
 */
const applyEntryMutation = async (db, headId, { type, date, time, procurementId, entry }) => {
  const path = `entries.${date}.${time}`;
  const inc = { entries: 0, milk: 0, earned: 0, paid: 0, due: 0 };

  if (type === "set") {
    const existing = await db.collection(HEAD_ENTRIES).findOne(
      { _id: headId },
      { projection: { [`entries.${date}.${time}`]: 1 } },
    );
    const old = existing?.entries?.[date]?.[time];

    const newEarned = entry.totalAmount;
    const newPaid = entry.paymentStatus === "Paid" ? newEarned : 0;

    if (old) {
      const oldPaid = old.paymentStatus === "Paid" ? old.totalAmount : 0;
      inc.entries = 0;
      inc.milk = newEarned === 0 ? 0 : entry.milkQuantity - old.milkQuantity;
      inc.earned = newEarned - old.totalAmount;
      inc.paid = newPaid - oldPaid;
    } else {
      inc.entries = 1;
      inc.milk = entry.milkQuantity;
      inc.earned = newEarned;
      inc.paid = newPaid;
    }
    inc.due = inc.earned - inc.paid;

    await db.collection(HEAD_ENTRIES).updateOne(
      { _id: headId },
      {
        $set: {
          [path]: entry,
          [`byProcurement.${procurementId}`]: `${date}|${time}`,
          updatedAt: new Date(),
        },
        $inc: {
          "totals.entries": inc.entries,
          "totals.milk": inc.milk,
          "totals.earned": inc.earned,
          "totals.paid": inc.paid,
          "totals.due": inc.due,
        },
      },
      { upsert: true },
    );
  } else if (type === "unset") {
    const existing = await db.collection(HEAD_ENTRIES).findOne(
      { _id: headId },
      { projection: { [`entries.${date}.${time}`]: 1 } },
    );
    const old = existing?.entries?.[date]?.[time];
    if (!old) return;

    const oldPaid = old.paymentStatus === "Paid" ? old.totalAmount : 0;

    await db.collection(HEAD_ENTRIES).updateOne(
      { _id: headId },
      {
        $unset: {
          [path]: "",
          [`byProcurement.${procurementId}`]: "",
        },
        $inc: {
          "totals.entries": -1,
          "totals.milk": -old.milkQuantity,
          "totals.earned": -old.totalAmount,
          "totals.paid": -oldPaid,
          "totals.due": -old.totalAmount + oldPaid,
        },
        $set: { updatedAt: new Date() },
      },
    );
  }
};

/** Build the cut entry object from a child's procurement. Null if no cut. */
const buildCutEntry = ({ supplier, procurementId, q, f, s, comment, actionDoneBy, now }) => {
  if (!supplier?.isChildSupplier) return null;
  if (supplier.supplierCustomRate) return null;

  const parentTsr = Number(supplier.supplierTSRate) || 0;
  const cutPercentage = Number(supplier.cutPercentage) || 0;
  if (cutPercentage <= 0 || cutPercentage >= parentTsr) return null;

  const childTsr = parentTsr - cutPercentage;
  const { totalSolids, ratePerLiter, totalAmount } = computeTsPricing(f, s, cutPercentage, q);

  return {
    procurementId,
    childSupplierId: new ObjectId(supplier._id),
    childSupplierName: supplier.supplierName || "",
    parentTsr: r4(parentTsr),
    cutPercentage: r4(cutPercentage),
    childTsr: r4(childTsr),
    milkQuantity: q,
    fatPercentage: f,
    snfPercentage: s,
    totalSolids: r4(totalSolids),
    ratePerLiter: r4(ratePerLiter),
    totalAmount: r2(totalAmount),
    paymentStatus: "Not Paid",
    comment: comment || "",
    actionDoneBy: actionDoneBy || "",
    createdAt: now,
    updatedAt: now,
  };
};

/** Read a head's entry by procurementId via the reverse index. */
const readEntryByProcurement = async (db, headId, procurementId) => {
  const head = await db.collection(HEAD_ENTRIES).findOne(
    { _id: headId },
    { projection: { byProcurement: 1, entries: 1 } },
  );
  if (!head) return null;

  const pointer = head.byProcurement?.[String(procurementId)];
  if (!pointer) return null;

  const [date, time] = pointer.split("|");
  return { date, time, entry: head.entries?.[date]?.[time] || null };
};

// =========================================================================
// POST — create procurement; if supplier is a child, write to head's doc
// =========================================================================
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      supplierId,
      date,
      time,
      milkQuantity,
      fatPercentage,
      snfPercentage,
      comment,
      actionDoneBy,
      paymentStatus,
    } = body;

    const sv = validateObjectId(supplierId);
    if (!sv.valid) return NextResponse.json({ error: sv.error }, { status: 400 });

    const dv = validateProcurementData({ date, time, milkQuantity, fatPercentage, snfPercentage });
    if (!dv.valid) return NextResponse.json({ error: dv.error }, { status: 400 });

    const db = await getDatabase();

    const supplier = await db.collection(SUPPLIERS).findOne(
      { _id: new ObjectId(supplierId) },
      {
        projection: {
          supplierName: 1, supplierType: 1,
          supplierTSRate: 1, supplierCustomRate: 1,
          isChildSupplier: 1, headSupplierId: 1, headSupplierName: 1,
          cutPercentage: 1,
        },
      },
    );
    if (!supplier) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });

    const q = parseFloat(milkQuantity);
    const f = parseFloat(fatPercentage);
    const s = parseFloat(snfPercentage);

    // Duplicate check
    const dup = await db.collection(PROCUREMENTS).findOne({
      supplierId: new ObjectId(supplierId),
      date, time,
      milkQuantity: q, fatPercentage: f, snfPercentage: s,
    });
    if (dup) {
      return NextResponse.json(
        { error: "Duplicate procurement", duplicateId: dup._id },
        { status: 409 },
      );
    }

    // Compute child pricing
    const isCustomRate = !!supplier.supplierCustomRate;
    const isChild = !!supplier.isChildSupplier && !!supplier.headSupplierId;
    const parentTsr = parseFloat(supplier.supplierTSRate);
    const cutPercentage = isChild && !isCustomRate ? Number(supplier.cutPercentage || 0) : 0;

    if (!parentTsr || parentTsr <= 0) {
      return NextResponse.json({ error: "Invalid supplier TSR" }, { status: 400 });
    }
    if (isChild && !isCustomRate && cutPercentage >= parentTsr) {
      return NextResponse.json(
        { error: `cutPercentage (${cutPercentage}) must be less than TSR (${parentTsr})` },
        { status: 400 },
      );
    }

    const childTsr = cutPercentage > 0 ? parentTsr - cutPercentage : parentTsr;
    let childPricing;
    if (isCustomRate) {
      const cr = parseFloat(supplier.supplierCustomRate);
      childPricing = { totalSolids: f + s, ratePerLiter: cr, totalAmount: cr * q };
    } else {
      childPricing = computeTsPricing(f, s, childTsr, q);
    }

    const now = new Date();
    const procurement = {
      supplierId: new ObjectId(supplierId),
      supplierName: supplier.supplierName,
      supplierType: supplier.supplierType,
      supplierTSRate: r4(childTsr),
      parentTsr: r4(parentTsr),
      cutPercentage: r4(cutPercentage),
      date, time,
      milkQuantity: q,
      fatPercentage: f,
      snfPercentage: s,
      customRate: isCustomRate,
      rate: r4(childPricing.ratePerLiter),
      totalAmount: r2(childPricing.totalAmount),
      paymentRecord: true,
      paymentStatus: paymentStatus || "Not Paid",
      actionDoneBy,
      comment: comment || "",
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection(PROCUREMENTS).insertOne(procurement);
    const procurementId = result.insertedId;

    // Write cut to head's doc (single document write, atomic)
    let cutEntry = null;
    if (isChild && cutPercentage > 0 && !isCustomRate) {
      cutEntry = buildCutEntry({
        supplier: { ...supplier, _id: supplierId },
        procurementId, q, f, s, comment, actionDoneBy, now,
      });

      if (cutEntry) {
        try {
          await applyEntryMutation(db, new ObjectId(supplier.headSupplierId), {
            type: "set",
            date,
            time,
            procurementId,
            entry: cutEntry,
          });
        } catch (err) {
          console.error("Head entry write failed, rolling back procurement:", err);
          await db.collection(PROCUREMENTS).deleteOne({ _id: procurementId });
          throw err;
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
        id: procurementId,
        message: "Procurement record created successfully",
        data: { ...procurement, _id: procurementId },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST procurement error:", error);
    return NextResponse.json(
      {
        error: "Failed to create record",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 },
    );
  }
}

// =========================================================================
// PUT — update procurement; sync the head's entry
// =========================================================================
export async function PUT(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const body = await request.json();

    const idv = validateObjectId(id);
    if (!idv.valid) return NextResponse.json({ error: idv.error }, { status: 400 });

    const dv = validateProcurementData({
      date: body.date, time: body.time,
      milkQuantity: body.milkQuantity,
      fatPercentage: body.fatPercentage,
      snfPercentage: body.snfPercentage,
    });
    if (!dv.valid) return NextResponse.json({ error: dv.error }, { status: 400 });

    const db = await getDatabase();
    const _id = new ObjectId(id);

    const existing = await db.collection(PROCUREMENTS).findOne({ _id });
    if (!existing) return NextResponse.json({ error: "Record not found" }, { status: 404 });

    // Duplicate check
    const dup = await db.collection(PROCUREMENTS).findOne({
      supplierId: existing.supplierId,
      date: body.date, time: body.time,
      milkQuantity: body.milkQuantity,
      fatPercentage: body.fatPercentage,
      snfPercentage: body.snfPercentage,
      _id: { $ne: _id },
    });
    if (dup) {
      return NextResponse.json(
        { error: "Duplicate procurement", duplicateId: dup._id },
        { status: 409 },
      );
    }

    const supplier = await db.collection(SUPPLIERS).findOne(
      { _id: existing.supplierId },
      {
        projection: {
          supplierName: 1, supplierTSRate: 1, supplierCustomRate: 1,
          isChildSupplier: 1, headSupplierId: 1, headSupplierName: 1, cutPercentage: 1,
        },
      },
    );

    const q = parseFloat(body.milkQuantity);
    const f = parseFloat(body.fatPercentage);
    const s = parseFloat(body.snfPercentage);

    const isCustomRate = !!supplier?.supplierCustomRate;
    const isChild = !!supplier?.isChildSupplier && !!supplier?.headSupplierId;
    const parentTsr = parseFloat(supplier?.supplierTSRate || 0);
    const cutPercentage = isChild && !isCustomRate ? Number(supplier?.cutPercentage || 0) : 0;
    const childTsr = cutPercentage > 0 ? parentTsr - cutPercentage : parentTsr;

    let childPricing;
    if (isCustomRate) {
      const cr = parseFloat(supplier.supplierCustomRate);
      childPricing = { totalSolids: f + s, ratePerLiter: cr, totalAmount: cr * q };
    } else {
      childPricing = computeTsPricing(f, s, childTsr, q);
    }

    const now = new Date();
    const updateData = {
      date: body.date, time: body.time,
      milkQuantity: q, fatPercentage: f, snfPercentage: s,
      supplierTSRate: r4(childTsr),
      parentTsr: r4(parentTsr),
      cutPercentage: r4(cutPercentage),
      rate: r4(childPricing.ratePerLiter),
      totalAmount: r2(childPricing.totalAmount),
      paymentStatus: body.paymentStatus ?? existing.paymentStatus,
      paymentUpdatedOn: now,
      updatedAt: now,
    };

    await db.collection(PROCUREMENTS).updateOne({ _id }, { $set: updateData });

    // Sync the head's entry
    if (isChild && cutPercentage > 0 && !isCustomRate) {
      const dateChanged = existing.date !== body.date || existing.time !== body.time;

      if (dateChanged) {
        await applyEntryMutation(db, new ObjectId(supplier.headSupplierId), {
          type: "unset",
          date: existing.date,
          time: existing.time,
          procurementId: _id,
        });
      }

      const newEntry = buildCutEntry({
        supplier: { ...supplier, _id: existing.supplierId },
        procurementId: _id, q, f, s,
        comment: existing.comment || "",
        actionDoneBy: existing.actionDoneBy || "",
        now,
      });

      if (newEntry) {
        newEntry.paymentStatus = updateData.paymentStatus;
        await applyEntryMutation(db, new ObjectId(supplier.headSupplierId), {
          type: "set",
          date: body.date,
          time: body.time,
          procurementId: _id,
          entry: newEntry,
        });
      }
    } else {
      const headDoc = await db.collection(HEAD_ENTRIES).findOne(
        { _id: new ObjectId(supplier?.headSupplierId) },
        { projection: { byProcurement: 1 } },
      );
      if (headDoc?.byProcurement?.[String(_id)]) {
        await applyEntryMutation(db, new ObjectId(supplier.headSupplierId), {
          type: "unset",
          date: existing.date,
          time: existing.time,
          procurementId: _id,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: "Procurement record updated successfully",
      data: { ...existing, ...updateData },
    });
  } catch (error) {
    console.error("PUT procurement error:", error);
    return NextResponse.json(
      {
        error: "Failed to update record",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 },
    );
  }
}

// =========================================================================
// DELETE — remove procurement and its head entry
// =========================================================================
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    const v = validateObjectId(id);
    if (!v.valid) return NextResponse.json({ error: v.error }, { status: 400 });

    const db = await getDatabase();
    const _id = new ObjectId(id);

    const existing = await db.collection(PROCUREMENTS).findOne({ _id });
    if (!existing) return NextResponse.json({ error: "Record not found" }, { status: 404 });

    const supplier = await db.collection(SUPPLIERS).findOne(
      { _id: existing.supplierId },
      { projection: { headSupplierId: 1, isChildSupplier: 1 } },
    );

    await db.collection(PROCUREMENTS).deleteOne({ _id });

    if (supplier?.isChildSupplier && supplier?.headSupplierId) {
      const headDoc = await db.collection(HEAD_ENTRIES).findOne(
        { _id: new ObjectId(supplier.headSupplierId) },
        { projection: { byProcurement: 1 } },
      );
      if (headDoc?.byProcurement?.[String(_id)]) {
        await applyEntryMutation(db, new ObjectId(supplier.headSupplierId), {
          type: "unset",
          date: existing.date,
          time: existing.time,
          procurementId: _id,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: "Procurement record deleted successfully",
      deletedId: id,
    });
  } catch (error) {
    console.error("DELETE procurement error:", error);
    return NextResponse.json(
      {
        error: "Failed to delete record",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 },
    );
  }
}

// =========================================================================
// PATCH — bulk payment status update (syncs head entries)
// =========================================================================
export async function PATCH(request) {
  try {
    const { procurementIds, status, actionDoneBy } = await request.json();

    if (!Array.isArray(procurementIds) || procurementIds.length === 0) {
      return NextResponse.json({ error: "No IDs provided" }, { status: 400 });
    }
    if (!status) return NextResponse.json({ error: "Status required" }, { status: 400 });

    const db = await getDatabase();
    const ids = procurementIds.map((id) => new ObjectId(id));
    const now = new Date();

    const result = await db.collection(PROCUREMENTS).updateMany(
      { _id: { $in: ids } },
      {
        $set: {
          paymentStatus: status,
          paymentUpdatedOn: now,
          paymentRecordDoneBy: actionDoneBy,
        },
      },
    );

    const procs = await db
      .collection(PROCUREMENTS)
      .find({ _id: { $in: ids } }, { projection: { _id: 1, supplierId: 1, date: 1, time: 1 } })
      .toArray();

    const groupedByHead = new Map();

    for (const p of procs) {
      const supplier = await db.collection(SUPPLIERS).findOne(
        { _id: p.supplierId },
        { projection: { headSupplierId: 1, isChildSupplier: 1 } },
      );
      if (!supplier?.isChildSupplier || !supplier?.headSupplierId) continue;

      const headKey = String(supplier.headSupplierId);
      if (!groupedByHead.has(headKey)) groupedByHead.set(headKey, []);
      groupedByHead.get(headKey).push(p);
    }

    for (const [headId, procs] of groupedByHead) {
      for (const p of procs) {
        const pointer = await readEntryByProcurement(db, new ObjectId(headId), p._id);
        if (!pointer?.entry) continue;

        const oldPaid = pointer.entry.paymentStatus === "Paid" ? pointer.entry.totalAmount : 0;
        const newPaid = status === "Paid" ? pointer.entry.totalAmount : 0;
        const paidDelta = newPaid - oldPaid;

        await db.collection(HEAD_ENTRIES).updateOne(
          { _id: new ObjectId(headId) },
          {
            $set: {
              [`entries.${pointer.date}.${pointer.time}.paymentStatus`]: status,
              [`entries.${pointer.date}.${pointer.time}.updatedAt`]: now,
              updatedAt: now,
            },
            $inc: {
              "totals.paid": paidDelta,
              "totals.due": -paidDelta,
            },
          },
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: `Updated ${result.modifiedCount} records`,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("PATCH procurement error:", error);
    return NextResponse.json(
      {
        error: "Failed to update records",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 },
    );
  }
}

// =========================================================================
// GET
// =========================================================================
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const supplierId = searchParams.get("supplierId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const id = searchParams.get("id");

    if (id) {
      const v = validateObjectId(id);
      if (!v.valid) return NextResponse.json({ error: v.error }, { status: 400 });
      const db = await getDatabase();
      const doc = await db.collection(PROCUREMENTS).findOne({ _id: new ObjectId(id) });
      if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(doc);
    }

    if (!supplierId) {
      return NextResponse.json({ error: "Supplier ID required" }, { status: 400 });
    }
    const v = validateObjectId(supplierId);
    if (!v.valid) return NextResponse.json({ error: v.error }, { status: 400 });

    const db = await getDatabase();
    const query = { supplierId: new ObjectId(supplierId) };

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = startDate;
      if (endDate) query.date.$lte = endDate;
    }

    const docs = await db
      .collection(PROCUREMENTS)
      .find(query)
      .sort({ date: -1, createdAt: -1 })
      .toArray();

    return NextResponse.json(docs);
  } catch (error) {
    console.error("GET procurement error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch data",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 },
    );
  }
}