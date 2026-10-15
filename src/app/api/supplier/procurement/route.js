import { NextResponse } from "next/server";
import getDatabase from "@/database/connectToMongoDB";
import { ObjectId } from "mongodb";
import {
  getProcurementStore,
  procurementWritePaused,
} from "@/lib/supplier-procurements.mjs";
import {
  commissionFromProcurement,
  findHeadEntry,
  mutateHeadEntry,
  withProcurementTransaction,
} from "@/lib/head-supplier-entries.mjs";
import {
  validateProcurementInput,
  validatePaymentStatus,
  priceProcurement,
  supplierPricingSnapshot,
  historicalPricingSnapshot,
} from "@/lib/procurement-pricing.mjs";

const requireId = (id) => {
  if (typeof id !== "string" || !ObjectId.isValid(id))
    throw Object.assign(new Error("Invalid ID format"), { status: 400 });
  return new ObjectId(id);
};
const fail = (message, status) => {
  throw Object.assign(new Error(message), { status });
};
const paused = () =>
  procurementWritePaused()
    ? NextResponse.json(
        { error: "Procurement writes are paused for migration" },
        { status: 503, headers: { "Retry-After": "60" } },
      )
    : null;
const failure = (error, message) => {
  if (error.code === "PROCUREMENT_DUPLICATE")
    return NextResponse.json(
      { error: "Duplicate procurement", duplicateId: error.duplicateId },
      { status: 409 },
    );
  if (error.status)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  console.error(message, error);
  return NextResponse.json(
    {
      error: message,
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    },
    { status: 500 },
  );
};
async function checkDuplicate(store, entry, exceptId) {
  const duplicate = await store.findOne({
    supplierId: entry.supplierId,
    date: entry.date,
    time: entry.time,
    milkQuantity: entry.milkQuantity,
    fatPercentage: entry.fatPercentage,
    snfPercentage: entry.snfPercentage,
    ...(exceptId ? { _id: { $ne: exceptId } } : {}),
  });
  if (duplicate)
    throw Object.assign(new Error("Duplicate procurement"), {
      code: "PROCUREMENT_DUPLICATE",
      duplicateId: duplicate._id,
    });
}

export async function POST(request) {
  const blocked = paused();
  if (blocked) return blocked;
  try {
    const body = await request.json();
    const supplierId = requireId(body.supplierId);
    const input = validateProcurementInput(body);
    const db = await getDatabase();
    const data = await withProcurementTransaction(db, async (tx) => {
      const supplier = await tx
        .collection("suppliers")
        .findOne({ _id: supplierId });
      if (!supplier) fail("Supplier not found", 404);
      const pricing = priceProcurement(
        input,
        supplierPricingSnapshot(supplier),
      );
      const now = new Date();
      const procurement = {
        _id: new ObjectId(),
        supplierId,
        supplierName: supplier.supplierName,
        supplierType: supplier.supplierType,
        ...pricing,
        paymentRecord: true,
        paymentStatus: body.paymentStatus || "Not Paid",
        actionDoneBy: body.actionDoneBy || "",
        comment: body.comment || "",
        createdAt: now,
        updatedAt: now,
      };
      if (pricing.cutPercentage > 0) {
        procurement.headSupplierId = requireId(String(supplier.headSupplierId));
        procurement.headSupplierName = supplier.headSupplierName || "";
        if (
          !(await tx
            .collection("suppliers")
            .findOne({ _id: procurement.headSupplierId }))
        )
          fail("Head supplier not found", 409);
      }
      const store = getProcurementStore(tx);
      await checkDuplicate(store, procurement);
      await store.insertOne(procurement);
      if (procurement.headSupplierId)
        await mutateHeadEntry(
          tx,
          procurement.headSupplierId,
          procurement._id,
          commissionFromProcurement(procurement),
          procurement.headSupplierName,
        );
      return procurement;
    });
    return NextResponse.json(
      {
        success: true,
        id: data._id,
        message: "Procurement record created successfully",
        data,
      },
      { status: 201 },
    );
  } catch (error) {
    return failure(error, "Failed to create record");
  }
}

export async function PUT(request) {
  const blocked = paused();
  if (blocked) return blocked;
  try {
    const id = requireId(new URL(request.url).searchParams.get("id"));
    const body = await request.json();
    const input = validateProcurementInput(body);
    const db = await getDatabase();
    const data = await withProcurementTransaction(db, async (tx) => {
      const store = getProcurementStore(tx);
      const existing = await store.findOne({ _id: id });
      if (!existing) fail("Record not found", 404);
      const head = await findHeadEntry(tx, existing);
      const pricing = priceProcurement(
        input,
        historicalPricingSnapshot(existing),
      );
      const now = new Date();
      const paymentChanged =
        body.paymentStatus !== undefined &&
        body.paymentStatus !== existing.paymentStatus;
      const update = {
        ...pricing,
        comment: body.comment ?? existing.comment ?? "",
        paymentStatus: body.paymentStatus ?? existing.paymentStatus,
        updatedAt: now,
        ...(paymentChanged
          ? {
              paymentUpdatedOn: now,
              paymentRecordDoneBy: body.actionDoneBy || "",
            }
          : {}),
      };
      if (head) update.headSupplierId = head.headId;
      const next = { ...existing, ...update };
      await checkDuplicate(store, next, id);
      await store.updateOne({ _id: id }, { $set: update });
      if (head) {
        const commission = commissionFromProcurement(next, head.entry);
        if (!commission && head.entry)
          fail(
            "Invalid historical commission rate; review this procurement before editing",
            409,
          );
        if (commission && paymentChanged) {
          commission.paymentStatus = next.paymentStatus;
          commission.paymentReviewRequired = false;
        }
        await mutateHeadEntry(tx, head.headId, id, commission);
      }
      return next;
    });
    return NextResponse.json({
      success: true,
      message: "Procurement record updated successfully",
      data,
    });
  } catch (error) {
    return failure(error, "Failed to update record");
  }
}

export async function DELETE(request) {
  const blocked = paused();
  if (blocked) return blocked;
  try {
    const id = requireId(new URL(request.url).searchParams.get("id"));
    const db = await getDatabase();
    await withProcurementTransaction(db, async (tx) => {
      const store = getProcurementStore(tx);
      const existing = await store.findOne({ _id: id });
      if (!existing) fail("Record not found", 404);
      const head = await findHeadEntry(tx, existing);
      if (head) await mutateHeadEntry(tx, head.headId, id, null);
      await store.deleteOne({ _id: id });
    });
    return NextResponse.json({
      success: true,
      message: "Procurement record deleted successfully",
      deletedId: String(id),
    });
  } catch (error) {
    return failure(error, "Failed to delete record");
  }
}

export async function PATCH(request) {
  const blocked = paused();
  if (blocked) return blocked;
  try {
    const { procurementIds, status, actionDoneBy } = await request.json();
    if (!Array.isArray(procurementIds) || !procurementIds.length)
      fail("No IDs provided", 400);
    validatePaymentStatus(status);
    const ids = [...new Set(procurementIds)].map(requireId);
    const db = await getDatabase();
    const result = await withProcurementTransaction(db, async (tx) => {
      const store = getProcurementStore(tx);
      const procurements = await store.find({ _id: { $in: ids } }).toArray();
      if (procurements.length !== ids.length)
        fail(
          "One or more procurements no longer exist; refresh and retry",
          409,
        );
      const now = new Date();
      for (const procurement of procurements) {
        const head = await findHeadEntry(tx, procurement);
        if (head?.entry)
          await mutateHeadEntry(tx, head.headId, procurement._id, {
            ...head.entry,
            paymentStatus: status,
            paymentReviewRequired: false,
            paymentUpdatedOn: now,
            paymentRecordDoneBy: actionDoneBy || "",
            updatedAt: now,
          });
      }
      return store.updateMany(
        { _id: { $in: ids } },
        {
          $set: {
            paymentStatus: status,
            paymentUpdatedOn: now,
            paymentRecordDoneBy: actionDoneBy || "",
            updatedAt: now,
          },
        },
      );
    });
    return NextResponse.json({
      success: true,
      message: `Updated ${result.modifiedCount} records`,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    return failure(error, "Failed to update records");
  }
}

export async function GET(request) {
  try {
    const params = new URL(request.url).searchParams;
    const db = await getDatabase();
    const store = getProcurementStore(db);
    if (params.get("id")) {
      const document = await store.findOne({
        _id: requireId(params.get("id")),
      });
      if (!document) fail("Not found", 404);
      return NextResponse.json(document);
    }
    const query = { supplierId: requireId(params.get("supplierId")) };
    const start = params.get("startDate"),
      end = params.get("endDate");
    if (start || end) {
      if (
        (start && !/^\d{4}-\d{2}-\d{2}$/.test(start)) ||
        (end && !/^\d{4}-\d{2}-\d{2}$/.test(end)) ||
        (start && end && start > end)
      )
        fail("Invalid date range", 400);
      query.date = {
        ...(start ? { $gte: start } : {}),
        ...(end ? { $lte: end } : {}),
      };
    }
    return NextResponse.json(
      await store.find(query).sort({ date: -1, createdAt: -1 }).toArray(),
    );
  } catch (error) {
    return failure(error, "Failed to fetch data");
  }
}
