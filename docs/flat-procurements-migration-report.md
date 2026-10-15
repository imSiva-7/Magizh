# Flat procurement cutover — 15 October 2026

The application was switched from `PROCUREMENTS_STORAGE=nested` to `PROCUREMENTS_STORAGE=flat` locally after a verified migration. The shared database maintenance gate is now `mode: "flat", paused: false`.

| Verified item | Result |
| --- | ---: |
| Individual procurement entries | 5,294 |
| Supplier summaries | 14 |
| Total milk | 190,220.37 L |
| Total amount | Rs. 7,099,197.37 |
| Paid entries | 5,013 |
| Paid amount | Rs. 6,730,954.38 |
| Unpaid entries | 281 |
| Unpaid/due amount | Rs. 368,242.99 |
| Missing flat entries added | 0 |
| Outdated legacy flat entries replaced | 1 |
| Outdated entries preserved in migration backup | 1 |
| Stale flat entries absent from nested source | 0 |

All current nested entries were compared with the flat collection using complete canonical BSON content, preserving IDs, entry timestamps, payment statuses, snapshots and unknown fields. Supplier summaries were independently rebuilt and compared with the stored summaries. The nested collection remains preserved with its original entries; its root revision counters were advanced to protect the transactional cutover from in-flight nested writers.

An initial apply attempt rolled back because the BSON-preserving client returned a numeric wrapper for the concurrency check's matched count. No entry/summary changes committed in that attempt. After correcting and testing the raw BSON response path, apply completed successfully. Independent verification passed, then activation rechecked source/target entries and summaries before releasing writes.

The local history API returned HTTP 200. Analytics and authenticated supplier-summary APIs returned HTTP 200 with the totals above. A supplier/date-range execution plan used a compound index and examined 181 documents for 181 matching entries, without unwinding nested history.

Validation passed: 44 isolated unit/migration tests, 9 real MongoDB transaction/integration checks (in a separate temporary test database), and 7 mocked browser checks. Targeted lint passed. Temporary database collections were removed after testing.

Invoice styling and the restored supplier page styling were not changed by this storage migration. Hosted applications still need the updated code and `PROCUREMENTS_STORAGE=flat`; changing `.env.local` only configures the local app.
