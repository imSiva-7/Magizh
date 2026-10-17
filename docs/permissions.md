# Mutation permissions

All API edits, deletes, bulk status/comment changes and settings changes require a currently authenticated user with the exact `admin` role. The `dev` role is not an admin override. The shared `src/lib/mutation-auth.js` guard uses the server session; the auth callback refreshes the account's role from MongoDB.

| Action | Admin | Employee / Developer |
| --- | --- | --- |
| Add customers, ordinary suppliers, orders, procurements, production entries or employee/advance entries | Yes | Yes, subject to existing page access |
| Record a new positive customer payment receipt | Yes | Yes |
| Edit or delete existing entries, prices or comments | Yes | No |
| Change procurement/order payment status | Yes | No |
| Correct customer payments, including positive corrections | Yes | No |
| Adjust stock manually or change minimum levels | Yes | No |
| Create head suppliers that change existing supplier links/commissions | Yes | No |
| Change roles, delete user accounts, create elevated accounts or run migrations | Yes | No |

Creating new business entries still updates their derived stock balances and totals as part of normal entry creation. Those automatic effects are not separate manual-edit permissions. Device attendance ingestion keeps its existing device authentication and processing.

Public registration may create ordinary employee accounts only; granting an elevated role requires an authenticated admin. Customer/supplier-classified accounts and unauthenticated requests cannot create business entries through these APIs. Existing route-level read permissions remain in place.

The UI hides or disables restricted controls, but the API is the authoritative check: bypassing the UI does not grant access. Unauthenticated mutations return 401; authenticated users without the required role receive 403 before any business-record changes.
