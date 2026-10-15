# Head supplier commission storage and repair

Head commissions remain in `head_supplier_entries`, one document per head supplier. The updated schema stores every commission separately by its original procurement ID:

```text
head_supplier_entries
└── head supplier document
    ├── years
    │   └── "2026".months."10".days."15".entries
    │       ├── procurementIdA → commission for child A
    │       └── procurementIdB → commission for child B
    ├── overall / paid / unpaid
    ├── totals: { entries, milk, earned, paid, due }
    ├── entryIds / entryPaths
    └── legacyReferences: unresolved historical references
```

Day, month, year and head summaries use the same overall/paid/unpaid structure as `supplier_procurements`. Each nested commission retains its procurement ID, child supplier, date, AM/PM, quality measurements, historical rates, amount and payment status. Existing unrelated head document fields are retained.

The old `entries[date][AM/PM]` structure allowed only one commission per shift across all of a head's children. Separate ID keys prevent one child's commission replacing another child's commission. The legacy `entries` and `byProcurement` fields are removed when a document is normalized; unresolved reverse references remain in `legacyReferences`.

## Read-only Atlas inspection — 15 October 2026

The prepared repair script completed a read-only dry run:

| Check | Count |
| --- | ---: |
| Existing head documents | 3 |
| Legacy head documents | 3 |
| Existing nested head documents | 0 |
| Surviving commission entries | 4 |
| Surviving entries marked unpaid | 4 |
| Reverse references | 4 |
| Referenced procurements present | 0 |
| Surviving commissions whose procurement is absent | 4 |
| Missing commissions recoverable from snapshots | 0 |
| Ambiguous head references | 0 |
| Invalid recovery snapshots | 0 |
| Head documents that would be normalized | 3 |
| Database writes performed | **0** |

Both the preserved `procurements` collection and the active `supplier_procurements` collection contained 5,294 procurement entries. None of the four existing head commission procurement IDs was present in either collection. The repair preserves all four surviving commissions and their unpaid status; an absent procurement is not grounds to discard a historical commission.

Dry-run fingerprint:

```text
e4ae6c925bf26b3f77f8d7de9f97ff01239cc357136ee8df8049322d7ddeb954
```

This inspection does not establish why those procurement records are absent. There were no missing commission rows recoverable through the existing reverse references. Commissions that have neither a surviving entry nor a reverse reference cannot be reconstructed safely by guessing the head from today's supplier relationships.

## Run another dry run

From the repository directory:

```powershell
node scripts/repair-head-supplier-entries.mjs
```

The script uses `MONGODB_URI`, `PROCUREMENTS_STORAGE` and optional `MONGODB_DB` from the environment or `.env.local`. The database defaults to `production`. It prints counts and a source fingerprint; it does not print connection credentials, supplier names, IDs or record contents. Dry run never creates indexes, backups or target documents.

## Apply a reviewed plan

The repair has **not** been applied by the inspection above. To apply it, stop procurement additions, edits, deletions, payment updates, head commission updates and supplier relationship changes in every app instance and Atlas. Run a fresh dry run while those writes are stopped, then supply its fingerprint:

```powershell
node scripts/repair-head-supplier-entries.mjs --apply --writes-paused --expected-fingerprint <fresh-dry-run-fingerprint>
```

The script checks the fingerprint again immediately before the first write. For each changed head, it first inserts an immutable full original document into `head_supplier_entries_backup`, using `headId:sourceFingerprint` as the backup ID. An existing conflicting backup stops the repair. It then replaces the source only when the **entire original BSON document** still matches, protecting against legacy writers that do not maintain a revision counter.

Each replacement is read back and verified. Final verification rechecks the complete target documents, head count and referenced procurement contents. A concurrent change stops the repair; prior backups are preserved. This is a guarded multi-document maintenance operation, so interruption can leave some heads normalized and others legacy. Keep writes stopped, inspect the reported issue and run a fresh dry run before resuming. An unchanged, already normalized document is skipped; rerunning does not duplicate entries.

## Recovering an overwritten commission

Recovery is permitted only when a legacy reverse reference identifies exactly one historical head and its procurement still contains a valid historical cut, parent TSR, quantity, fat, SNF, date and shift. Current supplier relationships or current rates are not substituted.

A recovered row uses those snapshots to calculate the commission. Its original head payment status is unknowable: the repair sets `paymentStatus: "Not Paid"`, `paymentReviewRequired: true` and a recovery explanation. The commission must be reviewed before treating it as a confirmed unpaid liability. Existing surviving payment statuses remain authoritative even when they differ from the child procurement's payment status.

Ambiguous ownership, invalid references and invalid snapshots block apply. References to deleted procurements are retained as unresolved metadata rather than replaced with invented commissions. Invalid surviving commission IDs or shifts stop planning instead of disappearing during flattening.

## Verification

```powershell
node --test scripts/repair-head-supplier-entries.test.mjs
```

The 12 repair tests cover preserving payment statuses and BSON metadata, same-shift recovery, orphan records, unknown payment review, invalid snapshots, malformed surviving rows, dry-run write isolation, reviewed fingerprints, immutable backups, exact-document concurrency checks and repeatable application. These are isolated tests; they do not connect to Atlas.
