# Supplier procurement storage and migration

Use **`supplier_procurements`** as the MongoDB collection name, in the existing **`production`** database. You can create this empty collection in Atlas, or let the migration create it on the first apply. Do not rename or delete the original `procurements` collection.

Each supplier has one document. Dates use the procurement's existing calendar date, and every original entry keeps its BSON `_id`, supplier ID, payment status, timestamps, and other fields. Multiple entries on the same day remain separate, including multiple AM or PM entries.

```javascript
{
  _id: ObjectId("<supplier ID>"),
  supplierId: ObjectId("<supplier ID>"),
  schemaVersion: 1,
  revision: 0,
  years: {
    "2026": {
      months: {
        "10": {
          days: {
            "15": {
              entries: {
                "<original procurement ID>": {
                  _id: ObjectId("<original procurement ID>"),
                  supplierId: ObjectId("<supplier ID>"),
                  date: "2026-10-15",
                  time: "AM",
                  // All remaining original entry fields are preserved.
                },
              },
              overall: { count: 1, milkQuantity: 100, totalAmount: 4000 },
              paid: { count: 0, milkQuantity: 0, totalAmount: 0 },
              unpaid: { count: 1, milkQuantity: 100, totalAmount: 4000 },
            },
          },
          overall: { /* month totals */ },
          paid: { /* paid month totals */ },
          unpaid: { /* unpaid month totals */ },
        },
      },
      overall: { /* year totals */ },
      paid: { /* paid year totals */ },
      unpaid: { /* unpaid year totals */ },
    },
  },
  overall: { count: 1, milkQuantity: 100, totalAmount: 4000 },
  paid: { count: 0, milkQuantity: 0, totalAmount: 0 },
  unpaid: { count: 1, milkQuantity: 100, totalAmount: 4000 },
  entryIds: [ObjectId("<original procurement ID>")],
  entryPaths: {
    "<original procurement ID>": "years.2026.months.10.days.15.entries.<original procurement ID>",
  },
  createdAt: ISODate("..."),
  updatedAt: ISODate("..."),
}
```

`overall`, `paid`, and `unpaid` are maintained at supplier, year, month and day levels. `Paid` entries contribute to `paid`; all other existing payment statuses contribute to `unpaid`, matching the application's payment logic. These are whole-entry payment categories, not partial-payment balances. The original payment status value is retained.

The migration does not change `head_supplier_entries`. Original procurement entry IDs are retained inside the supplier documents, so existing references to those IDs, including head-supplier entries, continue to identify the same procurements.

## Before running

- Back up the Atlas database using your normal backup or export process. The migration also leaves `procurements` untouched as the original copy.
- Deploy the code with `PROCUREMENTS_STORAGE=legacy`, or leave this setting unset; legacy is the default. Do not enable nested storage until migration and independent verification pass.
- Make sure the script is using the intended Atlas environment. It reads `MONGODB_URI` from the shell environment first, then `.env.local` in the project root. `MONGODB_DB` optionally overrides the default database name `production`. It does not print the URI or individual supplier/entry records.
- Stop **all** procurement creation, editing, deleting and payment updates, including background jobs, other app instances, imports and direct Atlas writes. Keep both procurement collections frozen through migration, independent verification and cutover. The `--writes-paused` flag records your confirmation; it does not stop the application for you.

The application's procurement API also supports `PROCUREMENTS_WRITES_PAUSED=true` while the migration is in progress. Set it on every app instance and restart/redeploy to block procurement mutations before running apply. This does not stop external jobs or direct Atlas writes; pause those separately. Keep this setting enabled through verification and remove it only after all instances have switched to nested storage.

Run commands from the project directory:

```powershell
Set-Location C:\magizhdairyproductions
```

## 1. Preview and validate

```powershell
node scripts/migrate-supplier-procurements.mjs
```

The default is a **read-only dry run**. `--dry-run` is an equivalent explicit option. It validates IDs, dates, amounts, quantities, document size and the proposed nested structure, reports aggregate counts/milk/amount totals, and compares any existing target documents. It creates no collection or index and changes no records. Validation or a differing existing target document causes a nonzero exit.

The preview can be run earlier to find issues, but the source must stay frozen for the final dry run, apply and verification. If any record changes while a run is reading it, a complete source fingerprint recheck fails the run even when counts and totals happen to match.

## 2. Apply with writes paused

After stopping all procurement writes and checking the dry run output:

```powershell
node scripts/migrate-supplier-procurements.mjs --apply --writes-paused
```

Only `--apply` writes to Atlas, and it refuses to run without `--writes-paused`. It also refuses when the local `PROCUREMENTS_STORAGE` setting already equals `nested`.

The script inserts one document per supplier into `supplier_procurements` and creates unique indexes on `supplierId` and the multikey `entryIds` field. It does not modify indexes on `procurements`. Original procurement IDs remain globally unique across supplier documents.

Existing target documents are skipped only when their entire content matches the proposed document, ignoring only the root `createdAt`, `updatedAt` and `revision` metadata. Entry timestamps are compared. Differing target documents are never overwritten, merged, deleted or silently skipped. You can rerun an interrupted migration while the source remains frozen; already copied identical supplier documents are skipped.

The source fingerprint is checked again immediately before writes and after writes, followed by full target verification. A mismatch or database error exits unsuccessfully. Some target supplier documents may already have been inserted if a run fails; the source remains unchanged. Keep writes paused and investigate rather than switching storage after a failure.

## 3. Independently verify

While procurement writes are still stopped:

```powershell
node scripts/migrate-supplier-procurements.mjs --verify
```

Verification is read-only. It checks every source ID and complete entry payload against the stored target, the supplier/date path, ID/path indexes, all day/month/year/supplier summaries, and exact supplier and entry counts. It rejects missing, extra or duplicate entries and differing target structure. Complete canonical BSON-aware hashes retain BSON IDs, dates and numeric types in comparisons. Aggregate count, milk and monetary totals are printed without personal records.

The command must finish with **`Verification passed`** and exit code `0` before cutover. A matching number of documents alone is not sufficient. Zero records in both collections is valid but does not prove that you selected the right database; check the intended environment yourself.

## 4. Switch the application

With writes still stopped, set this environment variable for **every running application instance**:

```text
PROCUREMENTS_STORAGE=nested
```

Restart/redeploy the application with the new setting, check supplier procurement history, payment totals, analytics and stock, then reopen procurement writes. All instances must use the same storage mode. Changing `.env.local` only affects local runs; hosted deployments need the variable configured in their deployment environment.

Keep the original `procurements` collection as a preserved pre-cutover copy. Once nested writes resume it becomes stale: **do not replay the legacy migration over live nested data** and do not interpret a subsequent legacy-versus-nested mismatch as permission to overwrite the target.

## Growth and rollback

MongoDB limits each BSON document to 16 MiB. The application and migration reject a supplier document above the stricter **15 MiB** safety threshold. No entry is silently dropped or automatically archived. A supplier accumulating enough history will need a reviewed partition/archive strategy (for example supplier/year documents) before reaching this limit. This model favors supplier-local history and summary reads but is not unlimited storage per supplier.

Before writes resume, switching back to legacy mode is possible because the source was not changed. After new entries, edits, deletes or payments have been written to nested storage, the old collection is no longer a current rollback target. Pause writes, back up both collections, and reconcile/export post-cutover changes before any rollback. Flipping the flag back on its own would hide those changes.

The script reads source records and proposed supplier documents into memory for validation. Run it on a machine with enough memory for the procurement collection. No live Atlas migration is performed just by installing or deploying this code.
