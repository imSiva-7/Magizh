# ZKTeco attendance upload

`GET /iclock/cdata?SN=<serial>` returns the existing plain-text `OK`
handshake. `POST /iclock/cdata?SN=<serial>&table=ATTLOG` accepts tab-separated
attendance uploads. Lowercase `sn` is also accepted. Missing `table` defaults
to `ATTLOG` for compatibility. The `.aspx` and old
`/api/attendance/iclock/cdata` URLs are aliases for the same handler.

Example payload (the gaps below must be actual tabs):

```text
2201	2026-10-15 08:00:00	0	1	0
2201	2026-10-15 18:00:00	1	1	0
```

## Storage and reliability

- Device dates/times are interpreted as Indian local time (`+05:30`), even
  when the hosting server runs in UTC. Dates and times must be valid calendar
  values, including seconds. Employee IDs and serials accept letters, digits,
  underscores, and hyphens, up to 64 characters.
- An event is identified by employee ID, local date/time, and device serial.
  Retries do not append duplicate punches. Existing duplicates on the touched
  days are consolidated, and an identical batch requires no additional
  attendance write.
- Reads project only the days in the batch. Updates change those days rather
  than replacing the employee's whole attendance history. A compare-and-set
  filter detects concurrent changes and reloads/retries up to five times.
  Unrelated days and employee fields stay intact. This follows MongoDB's
  [documented concurrent-update pattern](https://www.mongodb.com/docs/manual/core/write-operations-atomicity/).
- Each employee normally requires one read and one write per upload, even when
  several days are included. At most four employees are processed concurrently.
- Unknown employee IDs are saved to `iclock_unmatched`, using a deterministic
  `_id` to deduplicate retries. They are **not automatically counted as attendance**.
  After correcting/creating the matching employee, replay the punches through
  the normal upload path or reconcile them explicitly. These queued records
  remain until reconciled; no attendance data is silently discarded.
- Uploads are capped at 8 MiB, enforced while reading the stream. Non-`ATTLOG`
  tables are acknowledged and ignored; enrollment templates are not stored.
  Logs contain batch counts rather than raw employee punch data.

## Responses

| Status | Body | Meaning |
| --- | --- | --- |
| 200 | `OK` | Saved, durably queued, empty, or an ignored non-attendance table |
| 400 | `INVALID SN` / `INVALID ATTLOG` | Invalid serial or any malformed attendance line; no attendance writes |
| 403 | `UNKNOWN DEVICE` | Serial not in the configured allowlist |
| 413 | `UPLOAD TOO LARGE` | More than 8 MiB |
| 503 | `ERROR` | Database/storage failure or repeated concurrent conflicts; retry after 10 seconds |

A failed batch can be resent safely, including when some employees were saved
before another employee failed. Only a successful storage result is acknowledged.

## Configuration and shift policy

Optionally set `ICLOCK_ALLOWED_SERIALS=serial1,serial2` in the deployment
environment. Leave it unset to retain compatibility with the existing terminal.
Serial filtering is not cryptographic device authentication; serials can be
copied. Use a trusted network/gateway when exposing the endpoint.

The existing payroll policy is preserved: first and last distinct punches in
each calendar day determine hours, up to 10 regular hours and the rest overtime.
Punch states are retained for future shift support, but do not change this rule.
Break deductions and overnight shift pairing are not inferred. A 22:00 punch and
a 06:00 punch on the next day remain two incomplete calendar days.

## Verification without the machine

Run `npx jest src/app/iclock/cdata/route.test.js --runInBand` for mocked storage
tests. These cover duplicates, concurrent uploads, invalid dates, unmatched
employees, legacy null parents, storage failures, upload limits, and timezone
conversion. No real employee records are written by the tests.

Run `npx playwright test e2e/iclock-http.spec.js` for read-only/invalid-request
HTTP checks, including the URL aliases. Set `PLAYWRIGHT_TEST_BASE_URL` to the
local dairy server URL when another app is running on port 3000.

The handshake and acknowledgement text remain unchanged. Firmware-specific
options negotiation, verification-code mappings, and actual device retries
still need a terminal check when the machine is available.
