# Customer subscriptions

Open **Customers → Subscriptions**, or the Subscriptions link beside a customer.
Choose products, quantities, agreed unit prices, delivery weekdays, start/end dates,
GST treatment and whether to deduct stock. Saved prices are fixed for that subscription;
changing a customer's price later does not change it. To replace a plan, cancel it
and create a new one. Only admins can pause, resume, cancel or skip deliveries.

Orders are regular unpaid orders. The existing order transaction updates stock,
the customer/global totals and customer summaries together. Insufficient stock rolls
back the whole delivery and leaves it due for retry. A durable subscription/date run
claim prevents duplicate generation, including after deleting a generated order.
Existing orders are not deleted when pausing or cancelling a plan. Resuming starts
from today (or its original future start date), without backfilling paused dates.
Generation uses Asia/Kolkata calendar dates and never creates future orders.

## Enable unattended generation

1. Configure a strong random `CRON_SECRET` in the deployment environment. Never use
   `NEXT_PUBLIC_` for this value or commit the actual value to source control.
2. Deploy on Vercel with the included `vercel.json`: the cron path runs daily at
   `00:30 UTC` (about **6:00 AM IST**). Actual timing depends on the hosting plan.
   The configuration is not active until deployed. Verify successful runs in the
   hosting dashboard; setting the secret alone does not prove the scheduler runs.
3. On another host, schedule `GET /api/cron/customer-subscriptions` with
   `Authorization: Bearer <CRON_SECRET>` daily. The endpoint rejects unauthenticated
   calls and fails closed if the secret is missing.
4. **Generate due orders** provides a signed-in staff fallback. It processes only
   the selected customer when the page is filtered. Repeating it is safe.

Each call handles at most 50 due subscriptions, 100 calendar dates total and 31
dates per subscription. If a host interruption or an extended outage leaves a
backlog, repeat generation until `remaining` is zero. Inspect `errors`/`lastError`
and correct stock/customer problems before retrying. Alerts/monitoring and any more
frequent cron schedule must be configured in the hosting service as needed.

MongoDB transactions require a replica set (as with existing customer orders).
The `subscription_runs` collection uses MongoDB's built-in unique `_id` index;
no migration or additional uniqueness index is required for duplicate protection.

## Invoices and payment matching are separate integrations

No customer messages, bank reads, payment collection or paid-balance changes are
performed by this feature. Invoice PDFs remain available through the existing order
pages. To automate delivery, select and connect an email/SMS/WhatsApp provider,
capture the customer's destination and consent, and add a retryable notification
outbox with one delivery key per invoice. Payment links or customer-specific bank
collection identifiers can supply verified payment webhooks. Verify webhook
signatures, deduplicate provider event IDs, link payments to the correct customer,
and write to the existing customer payment ledger transactionally. Match actual
confirmed receipts, not a link click or a screenshot. For general bank transfers
without a customer identifier, provide reconciliation/review before marking paid.
Use the provider's secure credential setup; never store customers' banking passwords.
