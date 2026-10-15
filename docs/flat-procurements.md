# Individual procurements and supplier summaries

Active storage is selected with `PROCUREMENTS_STORAGE=flat`.

* `procurements`: one complete, original procurement per document, retaining the original ID, pricing snapshots, payment status, audit details and unknown legacy fields.
* `supplier_summaries`: one summary per supplier, without a growing list of entries. `overall`, `paid`, and `unpaid` each contain count, milk quantity, amount, quantity-weighted FAT/SNF and average rate. `activeDays` and `avgMilkPerDay` describe days with collections.
* `supplier_procurements`: preserved nested migration source. It becomes a frozen backup after flat storage is activated.
* `procurements_flat_migration_backup`: immutable copies of any outdated legacy flat records replaced during migration, or old flat records absent from the authoritative nested source.
* `app_storage`, document `_id: "procurements"`: shared storage mode and maintenance gate. Stale application instances are prevented from writing with a different storage mode.

## Reads and writes

The existing procurement, history, payments and invoice response formats remain unchanged. Flat reads query indexed records directly; they do not flatten a supplier's lifetime history. Compound indexes cover supplier/date, global date, and supplier/payment/date queries. Date-filtered reports calculate their own period totals. Unfiltered procurement analytics use the supplier summaries for overall totals.

`GET /api/supplier/summary?supplierId=...` returns one supplier's lifetime summary, excluding internal counters. Omitting the ID returns global lifetime milk, amount, entry count, paid and due totals. This endpoint requires an authenticated session.

Every mutation runs inside a MongoDB transaction. It changes the affected entries, applies only their old/new contributions to supplier summaries, and synchronizes head commissions in that same transaction. A failure rolls all changes back. Concurrent writes to a supplier summary cause the transaction to retry; duplicate creates are rechecked on retry. Payment batches update entries in bulk and update each affected supplier summary once.

Summary counters use integer fixed-point values stored as BSON Decimal128: milk to four decimals, amounts to cents, quality measurements to four decimals. Weighted counters are `milkUnits × qualityUnits`. The public summary fields are ordinary numbers; internal `_metrics` counters prevent accumulated floating-point drift. Deleting the last record keeps a zero summary. Active-day changes use indexed existence queries for the affected dates.

## Migration

The nested source is authoritative, because old flat records may have become stale after the earlier migration. Existing flat records are never assumed current merely because their IDs exist.

```powershell
node scripts/migrate-flat-procurements.mjs --dry-run
node scripts/migrate-flat-procurements.mjs --apply
# Set PROCUREMENTS_STORAGE=flat in every running application instance.
node scripts/migrate-flat-procurements.mjs --verify
node scripts/migrate-flat-procurements.mjs --activate
```

Apply installs a shared maintenance gate, fingerprints source/target contents, backs up changed legacy rows, restores every current nested record with original BSON values, builds summaries and verifies every entry and summary before committing. Revision writes lock all nested source documents, so in-flight transactions conflict and retry against the maintenance gate. A failure leaves app writes paused and rolls back entry/summary changes. Direct Atlas writers and older deployed app versions lacking the maintenance gate must remain stopped throughout cutover.

Activation requires flat configuration, independently rechecks the frozen nested entries against the flat collection, verifies summaries, then releases writes. Subsequent verification derives summaries from current flat entries rather than comparing against the intentionally frozen nested backup. Reapplying the nested migration after activation is rejected to prevent overwriting newer flat entries with stale backup data.

Hosted deployments need the updated code and `PROCUREMENTS_STORAGE=flat`; local environment changes do not configure Vercel or other hosts.

## Validation

```powershell
node --test src/lib/flat-procurements.test.mjs
$env:RUN_MONGO_INTEGRATION='true'
node --test src/lib/flat-procurements.integration.test.mjs
```

The opt-in integration test uses a uniquely named temporary database, never production collections, and removes its test collections afterward. It verifies real MongoDB aggregation updates, transactions, edits, payments, concurrent creates, duplicate races, maintenance gates, final deletion, full BSON migration, backups and stale-reapply prevention.
