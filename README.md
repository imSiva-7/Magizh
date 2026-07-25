# Magizh Dairy – Factory Management App

**A full‑stack web application for a real‑world dairy factory**, built with **Next.js** and **MongoDB**.  
It handles daily production, supplier procurement, customer orders, inventory (stock), payments, and analytics – all in one place.

> Live demo: [magizhdairy.vercel.app](https://magizhdairy.vercel.app)

---

## Features

- **Production Management** – Record daily milk processing and by‑products (curd, butter, ghee, paneer, cream) with automatic stock updates.
- **Supplier Management** – Add suppliers, track milk procurement, rates (TS/fat), and due payments.
- **Customer Management** – Manage customer details, product‑wise rates, and GST information.
- **Order Management** – Create and edit customer orders with optional stock deduction, GST support, and invoice generation (PDF).
- **Stock Management** – Real‑time stock levels with a full ledger of all movements (production, orders, adjustments). Minimum stock thresholds for alerts.
- **Payment System** – Customer‑balance based partial payment tracking. Record any amount and automatically update the customer’s due.
- **Analytics Dashboard** – Visual summaries (pie & bar charts) for production, stock, supplier totals, and customer outstanding.
- **Invoice Generation** – Download PDF invoices for individual orders or bulk export from history.
- **Authentication & Roles** – Admin‑only access for sensitive operations (NextAuth).

---

## Tech Stack

| Category     | Technology                                     |
|--------------|------------------------------------------------|
| Frontend     | Next.js (App Router), React, CSS Modules        |
| Backend      | Next.js API Routes, MongoDB                     |
| Charts       | Recharts                                       |
| Auth         | NextAuth.js                                    |
| PDF Export   | jsPDF, jspdf-autotable                         |
| Notifications| react‑toastify                                 |
| Deployment   | Vercel (or any Node.js host)                   |

---

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/yourusername/magizh-dairy.git
   cd magizh-dairy