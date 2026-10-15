# Supplier procurement migration report

Completed **15 October 2026**.

The migration copied **5,294 original procurement entries** from `production.procurements` into **14 supplier documents** in `production.supplier_procurements`. The original collection was preserved. Original entry IDs and BSON field values were retained; `head_supplier_entries` was not changed.

| Category | Entries | Milk quantity (L) | Total amount (INR) |
| --- | ---: | ---: | ---: |
| Overall | 5,294 | 190,220.37 | 7,099,197.37 |
| Paid | 5,013 | 181,502.77 | 6,730,954.38 |
| Unpaid | 281 | 8,717.60 | 368,242.99 |

Migration apply and a separate, read-only verification both succeeded. Verification checked all original IDs and entry contents, nested supplier/date locations, reverse indexes, and day/month/year/supplier summaries. An Atlas aggregation using in-memory `$documents` flattened the new structure and matched every original BSON field across all **5,294** entries.

Validation also passed **25 tests and lint**. After local cutover, the local procurement history endpoint returned HTTP `200` with **5,294** entries. Local procurement analytics returned HTTP `200` with **5,294** records, **190,220.37 L** of milk and **INR 7,099,197.37**, matching the migrated totals.

## Cutover status

**Only the local application was switched to nested storage.** Local `.env.local` now uses:

```text
PROCUREMENTS_STORAGE=nested
PROCUREMENTS_WRITES_PAUSED=false
```

**Before making any new procurement changes through a hosted application, deploy the changed code there and set `PROCUREMENTS_STORAGE=nested` for every hosted app instance.** Keep procurement writes paused on any instance still running the legacy code or storage mode. Restart/redeploy with the matching code and settings, verify history and analytics, and reopen writes only after all instances use nested storage.

The preserved `procurements` collection becomes stale as nested entries, payments, edits or deletions are made. Do not rerun a legacy backfill over active nested data, and do not switch back to legacy storage after new nested writes without reconciling those changes first. See [the migration guide](supplier-procurements-migration.md) for operating steps, the 15 MiB supplier document safety limit, and rollback considerations.
