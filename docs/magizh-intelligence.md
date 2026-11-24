# Magizh Intelligence · Phase 1

The admin overview shows a month-to-date snapshot and suggested next steps from the records, even if AI is not enabled. Sales and procurement use India dates (month start through today, inclusive). Stock and customer balances are current, not historical. This card is independent of the existing overview date filter. Suggested tasks are links to review records, not saved to-dos; the assistant cannot make changes, send messages or schedule anything.

## Enable AI chat and briefings

Set these **server-only** values in `.env.local` for development, or in the deployment environment (for example, Vercel’s Environment Variables). Restart the local server or redeploy after changing them. Do not add them to Git or prefix them with `NEXT_PUBLIC_`.

```dotenv
MAGIZH_AI_API_KEY=your-provider-api-key
MAGIZH_AI_MODEL=your-function-calling-model-id
# Optional; omit to use OpenAI. Use the base URL, not the full completions endpoint.
# MAGIZH_AI_BASE_URL=https://api.openai.com/v1
```

Choose a model your account has access to that supports [Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create), function calling with strict schemas, and `max_completion_tokens`. An alternate provider needs a compatible HTTPS `/chat/completions` endpoint that accepts bearer authentication and `store: false`. Verify its data handling and retention before enabling it. No database migration, AI SDK, or change to the existing MongoDB settings is required.

After setup, sign in as an admin and select **Generate AI briefing**, or open **Ask Magizh** on any authenticated workspace page. Try “Which products need a stock check?” and confirm the answer against the stock page. Without a key and model, chat and AI briefings remain unavailable; the card’s record-based figures and task suggestions still work. An invalid key/model, provider quota, and temporary failures are shown separately.

## Access and data handling

- Admins can read finished-product stock, production, period sales and procurement (including unpaid procurement records), and the total current amount customers owe. Employees and developers can ask about finished-product stock and the production records they already have access to. Other roles do not have assistant access. Account balances are not overdue-invoice totals; sales and procurement are not net profit or cash flow.
- Chat accepts today, this week (Monday through today), the last seven days, month-to-date, and the previous calendar month. Chat may compare those windows; arbitrary dates, raw transaction rows, individual account balances, and payroll are outside phase 1.
- A server session authorizes each request. The provider cannot query MongoDB directly. The app runs a small set of fixed, read-only queries and sends just the permitted aggregates, stock values and the user’s question (plus up to four previous questions) to the configured provider. No account identity, customer or supplier names, notes, or contact records are included by the data tools. Users should still avoid entering sensitive details in their questions.
- Briefings send the admin snapshot and generated task labels, only on request. Chat is kept in the page session, not stored in MongoDB or browser storage. A full reload clears it. The app requests `store: false`; that does not override provider retention policies.
- A per-instance request cap and timeout limit model usage. On a multi-instance deployment this is not a shared quota; set a provider-side budget and usage limits before rolling out widely. AI replies are guidance; confirm important numbers and decisions against the source screens.
