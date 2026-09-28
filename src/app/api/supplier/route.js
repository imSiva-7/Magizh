import { NextResponse } from "next/server";
import getDatabase from "@/database/connectToMongoDB";
import { ObjectId } from "mongodb";

const METHOD_NAMES = {
  GET: "GET /api/supplier",
  POST: "POST /api/supplier",
  PUT: "PUT /api/supplier",
  DELETE: "DELETE /api/supplier",
};

const VALID_SORT_FIELDS = ["createdAt", "updatedAt", "supplierName", "supplierTSRate"];
const VALID_SORT_ORDERS = ["asc", "desc"];

// --- Helpers ---

/** Normalise childSuppliers array coming from the client. */
function sanitizeChildSuppliers(rawChildren, selfId = null, headSupplierName = "") {
  if (!Array.isArray(rawChildren)) return [];

  const seen = new Set();
  const out = [];

  for (const child of rawChildren) {
    if (!child || typeof child !== "object") continue;

    const rawId = child.supplierId ?? child._id;
    if (!rawId || !ObjectId.isValid(rawId)) continue;

    const idStr = String(rawId);

    // Reject self-reference
    if (selfId && idStr === String(selfId)) continue;

    // Reject duplicates
    if (seen.has(idStr)) continue;
    seen.add(idStr);

    const rawCut = child.cutPercentage ?? child.tsCut;
    const cutPercentage = rawCut === "" || rawCut == null ? 0 : Number(rawCut);

    out.push({
      supplierId: new ObjectId(rawId),
      supplierName: String(child.supplierName || "").trim(),
      isChildSupplier: true,
      cutPercentage: Number.isFinite(cutPercentage) ? cutPercentage : 0,
      headSupplierName: String(headSupplierName || "").trim(),
    });
  }

  return out;
}

/** Build a Mongo query from search params. */
function buildListQuery(search) {
  const query = {};
  if (search && search.trim()) {
    const term = search.trim();
    query.$or = [
      { supplierName: { $regex: term, $options: "i" } },
      { supplierType: { $regex: term, $options: "i" } },
      { supplierNumber: { $regex: term, $options: "i" } },
    ];
  }
  return query;
}

/**
 * Write back-reference fields onto each child document.
 * Also marks them isChildSupplier: true.
 */
async function linkChildrenToHead(db, headId, headName, children) {
  if (!children?.length) return;

  const ops = children.map((c) => ({
    updateOne: {
      filter: { _id: new ObjectId(c.supplierId) },
      update: {
        $set: {
          isChildSupplier: true,
          headSupplierId: headId,
          headSupplierName: headName,
          cutPercentage: c.cutPercentage,
          updatedAt: new Date(),
        },
      },
    },
  }));

  await db.collection("suppliers").bulkWrite(ops);
}

/**
 * Clear back-reference fields on child documents — but only if they
 * currently point to *this* head (prevents clobbering a different head's data).
 */
async function unlinkChildrenFromHead(db, headId, childIds) {
  if (!childIds?.length) return;

  const ids = childIds.map((id) => new ObjectId(id));

  await db.collection("suppliers").updateMany(
    { _id: { $in: ids }, headSupplierId: headId },
    {
      $set: { isChildSupplier: false, updatedAt: new Date() },
      $unset: { headSupplierId: "", headSupplierName: "", cutPercentage: "" },
    },
  );
}

/**
 * Detect a direct A→B→A cycle (child already has this head as its own child).
 * Deep cycles (A→B→C→A) would need a graph walk; not handled here.
 */
async function wouldCreateCycle(db, headId, children) {
  if (!children?.length) return false;

  const childIds = children.map((c) => new ObjectId(c.supplierId));

  const conflict = await db.collection("suppliers").findOne({
    _id: { $in: childIds },
    "childSuppliers.supplierId": headId,
  });

  return !!conflict;
}

// --- GET ---
export async function GET(request) {
  const METHOD = METHOD_NAMES.GET;

  try {
    const { searchParams } = new URL(request.url);
    const supplierId = searchParams.get("supplierId");
    const search = searchParams.get("search");
    const sortBy = searchParams.get("sortBy") || "supplierName";
    const sortOrder = searchParams.get("sortOrder") || "asc";

    if (!VALID_SORT_FIELDS.includes(sortBy)) {
      return NextResponse.json(
        { error: `Invalid sortBy. Allowed: ${VALID_SORT_FIELDS.join(", ")}` },
        { status: 400 },
      );
    }
    if (!VALID_SORT_ORDERS.includes(sortOrder)) {
      return NextResponse.json(
        { error: `Invalid sortOrder. Allowed: ${VALID_SORT_ORDERS.join(", ")}` },
        { status: 400 },
      );
    }

    const db = await getDatabase();

    if (supplierId) {
      if (!ObjectId.isValid(supplierId)) {
        return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
      }

      const supplier = await db
        .collection("suppliers")
        .findOne({ _id: new ObjectId(supplierId) });

      if (!supplier) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      return NextResponse.json(supplier);
    }

    const query = buildListQuery(search);
    const sortDir = sortOrder === "asc" ? 1 : -1;

    const suppliers = await db
      .collection("suppliers")
      .find(query)
      .sort({ [sortBy]: sortDir })
      .toArray();

    return NextResponse.json(suppliers);
  } catch (error) {
    console.error(`${METHOD} error:`, error);
    return NextResponse.json({ error: "Fetch failed" }, { status: 500 });
  }
}

// --- POST ---
export async function POST(request) {
  const METHOD = METHOD_NAMES.POST;

  try {
    const db = await getDatabase();
    const data = await request.json();

    const phone = data.supplierNumber?.trim();

    if (phone) {
      const existing = await db
        .collection("suppliers")
        .findOne({ supplierNumber: phone });

      if (existing) {
        return NextResponse.json(
          { error: "Supplier with this phone number already exists" },
          { status: 409 },
        );
      }
    }

    const supplierName = data.supplierName.trim();
    const isHeadSupplier = Boolean(data.isHeadSupplier);

    const childSuppliers = isHeadSupplier
      ? sanitizeChildSuppliers(data.childSuppliers, null, supplierName)
      : [];

    if (isHeadSupplier && childSuppliers.length === 0) {
      return NextResponse.json(
        { error: "Head supplier must have at least one child supplier" },
        { status: 400 },
      );
    }

    const supplierData = {
      supplierName,
      supplierType: data.supplierType?.trim() || "",
      isHeadSupplier,
      isChildSupplier: false,                    // ← default; set true only via parent link
      childSuppliers,
      supplierTSRate: data.supplierTSRate,
      supplierCustomRate: data.supplierCustomRate ?? "",
      supplierNumber: phone || "",
      supplierAddress: data.supplierAddress?.trim() || "",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("suppliers").insertOne(supplierData);
    const newHeadId = result.insertedId;

    // ✅ Now push the back-reference into each child document.
    if (isHeadSupplier && childSuppliers.length > 0) {
      try {
        await linkChildrenToHead(db, newHeadId, supplierName, childSuppliers);
      } catch (linkError) {
        // Roll back the head insert so DB stays consistent
        console.error("Child link failed, rolling back head insert:", linkError);
        await db.collection("suppliers").deleteOne({ _id: newHeadId });
        throw linkError;
      }
    }

    return NextResponse.json(
      {
        _id: newHeadId,
        ...supplierData,
        message: "Supplier created successfully",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error(`${METHOD} error:`, error);
    return NextResponse.json(
      { error: "Failed to create supplier", details: error.message },
      { status: 500 },
    );
  }
}

// --- PUT ---
export async function PUT(request) {
  const METHOD = METHOD_NAMES.PUT;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Valid ID required" }, { status: 400 });
    }

    const db = await getDatabase();
    const data = await request.json();
    const _id = new ObjectId(id);

    // Fetch current state so we can diff children
    const existing = await db.collection("suppliers").findOne({ _id });
    if (!existing) {
      return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
    }

    const phone = data.supplierNumber?.trim();

    if (phone) {
      const duplicate = await db.collection("suppliers").findOne({
        supplierNumber: phone,
        _id: { $ne: _id },
      });

      if (duplicate) {
        return NextResponse.json(
          { error: "Another supplier with this phone number already exists" },
          { status: 409 },
        );
      }
    }

    // Resolve final name (used for the child snapshots)
    const finalHeadName =
      data.supplierName !== undefined
        ? data.supplierName.trim()
        : existing.supplierName;

    // Build the update object
    const updateData = { updatedAt: new Date() };

    if (data.supplierName !== undefined) updateData.supplierName = data.supplierName.trim();
    if (data.supplierType !== undefined) updateData.supplierType = data.supplierType.trim();
    if (data.supplierTSRate !== undefined) updateData.supplierTSRate = data.supplierTSRate;
    if (data.supplierCustomRate !== undefined) updateData.supplierCustomRate = data.supplierCustomRate;
    if (data.supplierNumber !== undefined) updateData.supplierNumber = phone || "";
    if (data.supplierAddress !== undefined) updateData.supplierAddress = data.supplierAddress.trim();

    // Figure out the FINAL children array
    let finalChildren;
    if (data.isHeadSupplier !== undefined) {
      const isHead = Boolean(data.isHeadSupplier);
      updateData.isHeadSupplier = isHead;
      finalChildren = isHead
        ? sanitizeChildSuppliers(data.childSuppliers, _id, finalHeadName)
        : [];
      updateData.childSuppliers = finalChildren;
    } else if (data.childSuppliers !== undefined) {
      finalChildren = sanitizeChildSuppliers(data.childSuppliers, _id, finalHeadName);
      updateData.childSuppliers = finalChildren;
    } else {
      finalChildren = existing.childSuppliers || [];
    }

    // Prevent A→B→A
    if (updateData.isHeadSupplier && finalChildren.length > 0) {
      const cyclic = await wouldCreateCycle(db, _id, finalChildren);
      if (cyclic) {
        return NextResponse.json(
          { error: "Cycle detected: one of the selected children already has this supplier as its child" },
          { status: 400 },
        );
      }
    }

    // Apply the head update
    const result = await db
      .collection("suppliers")
      .updateOne({ _id }, { $set: updateData });

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
    }

    // Diff children → link added, unlink removed, update cut on kept
    const oldChildren = existing.childSuppliers || [];
    const oldIds = new Set(oldChildren.map((c) => String(c.supplierId)));
    const newIds = new Set(finalChildren.map((c) => String(c.supplierId)));

    const addedChildren = finalChildren.filter((c) => !oldIds.has(String(c.supplierId)));
    const removedIds = oldChildren
      .filter((c) => !newIds.has(String(c.supplierId)))
      .map((c) => c.supplierId);

    // Kept children: still need cut/headSupplierName refresh (in case name or cut changed)
    const keptChildren = finalChildren.filter((c) => oldIds.has(String(c.supplierId)));

    if (updateData.isHeadSupplier === false) {
      // No longer a head — clear back-refs on ALL previous children
      await unlinkChildrenFromHead(db, _id, oldChildren.map((c) => c.supplierId));
    } else {
      if (addedChildren.length > 0) {
        await linkChildrenToHead(db, _id, finalHeadName, addedChildren);
      }
      if (keptChildren.length > 0) {
        await linkChildrenToHead(db, _id, finalHeadName, keptChildren); // refresh cut / name
      }
      if (removedIds.length > 0) {
        await unlinkChildrenFromHead(db, _id, removedIds);
      }
    }

    return NextResponse.json({
      message: "Supplier updated successfully",
      updated: updateData,
    });
  } catch (error) {
    console.error(`${METHOD} error:`, error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

// --- DELETE ---
export async function DELETE(request) {
  const METHOD = METHOD_NAMES.DELETE;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Valid ID required" }, { status: 400 });
    }

    const db = await getDatabase();
    const _id = new ObjectId(id);

    // 1. Procurements
    const procurementCount = await db
      .collection("procurements")
      .countDocuments({ supplierId: _id });

    if (procurementCount > 0) {
      return NextResponse.json(
        {
          error: "Cannot delete supplier with existing procurements",
          details: `Supplier has ${procurementCount} associated procurement(s)`,
        },
        { status: 409 },
      );
    }

    // 2. Referenced as a child by another head supplier (via array field)
    const parentCount = await db
      .collection("suppliers")
      .countDocuments({ "childSuppliers.supplierId": _id });

    if (parentCount > 0) {
      return NextResponse.json(
        {
          error: "Cannot delete supplier that is a child of another supplier",
          details: `Referenced as a child in ${parentCount} supplier(s). Remove it from those parents first.`,
        },
        { status: 409 },
      );
    }

    // Fetch the doc first so we know its children (to unlink them after delete)
    const target = await db.collection("suppliers").findOne({ _id });
    if (!target) {
      return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
    }

    // 3. Delete the head
    const result = await db.collection("suppliers").deleteOne({ _id });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
    }

    // 4. Clear back-refs on the (now-orphaned) children
    const childIds = (target.childSuppliers || []).map((c) => c.supplierId);
    if (childIds.length > 0) {
      await unlinkChildrenFromHead(db, _id, childIds);
    }

    return NextResponse.json({
      message: "Supplier deleted successfully",
      deletedId: id,
    });
  } catch (error) {
    console.error(`${METHOD} error:`, error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}