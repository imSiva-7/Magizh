# Customer orders and summaries

Customers use separate order records and a bounded summary per customer:

- `customers`: customer details and prices.
- `orders`: one document per order; original IDs and fields stay intact.
- `customer_summaries`: one document per customer with order count, item-line count, sales value, paid/due order values and quantities for each product. No growing arrays or lifetime order lists.
- `total_orders`: existing customer account balances, including actual paid amounts and credit.
- `totalOrdersLedger`: existing account payment history.

MongoDB creates `customer_summaries` automatically. No manual collection creation or order migration is required. New order writes bootstrap a missing summary from that customer's current orders. Following writes update only the affected orders' contributions using integer cents and quantity units of 0.0001. Summary numbers outside JavaScript's safe integer range are rejected.

Order creation, edits, deletion, bulk status changes, stock ledger/balance updates and account order totals now commit within MongoDB transactions. Validation failures roll back writes. Account payment updates and ledger changes also commit together. MongoDB must support transactions (Atlas or a replica set).

Order `Paid`/`Not Paid` status and actual account payments remain independent, as in the existing application. The charts explicitly show **order payment status**. Marking an order Paid does not record an account payment; recording a payment does not automatically change orders. `orderPaidAmount`/`orderDueAmount` in summaries describe order status; `accountPaidAmount`/`accountDueAmount` in the summary endpoint describe the account.

Customer Payments uses amount-based receipts, not per-order Paid toggles. Enter each amount received, with payment method, optional reference and note. Account status is derived from all-time sales minus receipts: Unpaid, Part paid, Settled or Credit. Date filters only narrow the order list; they do not reset the account balance. The global summary separates outstanding dues from customer credit so one customer's credit does not hide another customer's debt.

Both the payments page and individual customer order page share the same payment dialog. It previews the remaining due or credit and accepts rupees to two decimals. A payment correction is a separate signed entry with a required reason; it cannot reduce the received total below zero. Receipt history retains existing entries and adds method/reference/reason plus the balance after each new entry. The server records the receipt time; this flow does not allocate receipts to individual invoices.

`PUT /api/customer/total_orders?customerId=...` records a delta in `paidAmount`. New clients also send `paymentId`, `kind` (`payment` or `correction`), `method`, `reference` and `note`. The same payment ID and details are idempotent, including retries after a response was lost. Reusing an ID with changed details returns 409. Receipts, account balance and global totals commit together. Legacy positive amount calls remain supported; zero amounts, malformed amounts and corrections without a reason return 400. Payments require a customer ID; direct edits to the global balance are rejected. Existing account totals and ledger history need no migration.

`GET /api/customer/summary?customerId=<id>` requires a session and returns a lifetime summary with account balances, excluding internal counters. When no stored summary exists, it computes a read-only fallback. Date-filtered charts aggregate the selected orders, rather than using lifetime summaries. Quantities of different products are kept separate because litres and kilograms cannot be summed meaningfully.

## Existing orders

Deploy the updated application to all writers before backfilling. Stop older app instances or jobs that bypass the new transactional summary updates. The backfill does not alter orders, customer details, account balances, or payment history.

```powershell
node scripts/backfill-customer-summaries.mjs --dry-run
node scripts/backfill-customer-summaries.mjs --apply
node scripts/backfill-customer-summaries.mjs --verify
```

The default is a read-only preview. Apply rebuilds all summaries in a snapshot transaction and installs order indexes for customer/date, date, and customer/payment/date queries. Concurrent writes through the updated app conflict and retry rather than losing summary updates. Verification compares every stored summary field and internal counter against current orders in a snapshot. Run it after apply; it must print `Verification passed`.

The script reads `MONGODB_URI` and optional `MONGODB_DB` (default `production`), with `.env.local` as a fallback. It prints aggregate counts only. It reads orders into memory, so run it on a machine with enough memory and within your database transaction limits. No live database changes happen from deploying code alone.
