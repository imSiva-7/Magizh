"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import PageHeading from "@/components/PageHeading";
import DataSkeleton from "@/components/DataSkeleton";
import { getTodayDate, formatDateForDisplay } from "@/lib/india-date.mjs";
import { SUBSCRIPTION_PRODUCTS, subscriptionOrder } from "@/lib/customer-subscription-rules";
import styles from "@/css/subscriptions.module.css";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const currency = value => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(value) || 0);
const freshForm = customerId => ({ customerId, startDate: getTodayDate(), endDate: "", weekdays: [0, 1, 2, 3, 4, 5, 6], gstType: "inclusive", affectStockValue: false });

function SubscriptionsContent() {
  const searchParams = useSearchParams();
  const customerId = searchParams.get("customerId") || "";
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const [customers, setCustomers] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [form, setForm] = useState(() => freshForm(customerId));
  const [products, setProducts] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [configured, setConfigured] = useState(false);
  const [skipDates, setSkipDates] = useState({});
  const query = customerId ? `?customerId=${encodeURIComponent(customerId)}` : "";
  const selected = customers.find(customer => customer._id === form.customerId);
  const items = useMemo(() => SUBSCRIPTION_PRODUCTS.filter(product => Number(products[product.name]?.quantity) > 0).map(product => ({ product: product.name, quantity: Number(products[product.name].quantity), ratePerUnit: Number(products[product.name].rate) })), [products]);
  const estimate = subscriptionOrder({ ...form, items }, { _id: form.customerId }, form.startDate).totalAmount;

  const load = useCallback(async () => {
    const responses = await Promise.all([fetch("/api/customer", { cache: "no-store" }), fetch(`/api/customer/subscriptions${query}`, { cache: "no-store" })]);
    const values = await Promise.all(responses.map(response => response.json()));
    responses.forEach((response, index) => { if (!response.ok) throw new Error(values[index].error || "Could not load subscriptions"); });
    setCustomers(values[0]); setSubscriptions(values[1].subscriptions); setConfigured(values[1].automationConfigured);
  }, [query]);
  useEffect(() => { let active = true; setLoading(true); setError(""); load().catch(cause => { if (active) setError(cause.message); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [load]);
  useEffect(() => { setForm(freshForm(customerId)); setProducts({}); }, [customerId]);

  function chooseCustomer(id) {
    setForm(current => ({ ...current, customerId: id }));
    const customer = customers.find(value => value._id === id);
    setProducts(Object.fromEntries(SUBSCRIPTION_PRODUCTS.map(product => [product.name, { quantity: "", rate: customer?.[product.priceKey] ?? "" }])));
  }
  // Deep-linked customers receive their saved prices too.
  useEffect(() => {
    if (!selected) return;
    setProducts(current => Object.fromEntries(SUBSCRIPTION_PRODUCTS.map(product => [product.name, current[product.name] || { quantity: "", rate: selected[product.priceKey] ?? "" }])));
  }, [selected]);

  async function mutate(url, method, body, success) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save changes");
      if (result.errors?.length) setError(result.errors.map(item => `${item.customerName}: ${item.error}`).join("; "));
      setMessage(typeof success === "function" ? success(result) : success);
      await load();
      return true;
    } catch (cause) { setError(cause.message); return false; }
    finally { setBusy(false); }
  }
  async function create(event) {
    event.preventDefault();
    if (await mutate("/api/customer/subscriptions", "POST", { ...form, items }, "Subscription created. Orders are generated on scheduled dates.")) {
      setForm(freshForm(customerId)); setProducts({});
    }
  }
  const action = (id, value, date) => mutate("/api/customer/subscriptions", "PATCH", { id, action: value, date }, "Subscription updated.");

  return <div className={styles.page}>
    <div className={styles.heading}><PageHeading title="Customer Subscriptions" section="RELATIONSHIPS" description="Regular deliveries for selected customers, without re-entering daily orders." /><Link data-button="secondary" href="/customer">Customers</Link></div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {message && <p className={styles.message} role="status">{message}</p>}
    {loading ? <DataSkeleton label="Loading subscriptions…" /> : <>
      <section className={styles.panel}>
        <div className={styles.heading}><div><h2>Scheduled orders</h2><p>{configured ? "Automation credentials are configured. The daily schedule runs after deployment; orders can also be generated below." : "Automatic generation is not enabled yet. Use Generate due orders to create scheduled orders."}</p></div>
          <button type="button" data-button="primary" disabled={busy} onClick={() => mutate(`/api/customer/subscriptions/generate${query}`, "POST", null, result => `${result.created} orders created. ${result.existing} already existed.${result.remaining ? ` ${result.remaining} subscriptions still have dates to process; generate again to continue.` : ""}`)}>{busy ? "Working…" : "Generate due orders"}</button>
        </div>
        <p>Orders appear in Order History and update customer balances. They start as Not Paid. Pausing stops future generation; resuming starts from today without charging for paused dates.</p>
        <Link href={customerId ? `/customer/order?customerId=${encodeURIComponent(customerId)}` : "/customer/order/history"}>View orders</Link>
      </section>

      <section className={styles.panel}>
        <h2>New subscription</h2>
        <form data-entry-form onSubmit={create}>
          <fieldset disabled={busy} className={styles.fields}>
            <legend className={styles.srOnly}>Delivery schedule and products</legend>
            <label>Customer<select value={form.customerId} required onChange={event => chooseCustomer(event.target.value)}><option value="">Select a customer</option>{customers.map(customer => <option key={customer._id} value={customer._id}>{customer.customerName} {customer.customerNumber ? `· ${customer.customerNumber}` : ""}</option>)}</select></label>
            <label>Start date<input type="date" value={form.startDate} min={getTodayDate()} required onChange={event => setForm({ ...form, startDate: event.target.value })} /></label>
            <label>End date (optional)<input type="date" value={form.endDate} min={form.startDate} onChange={event => setForm({ ...form, endDate: event.target.value })} /></label>
            <fieldset className={styles.weekdays}><legend>Delivery days</legend><button type="button" data-button="secondary" onClick={() => setForm({ ...form, weekdays: [0, 1, 2, 3, 4, 5, 6] })}>Every day</button>{DAYS.map((day, index) => <label key={day}><input type="checkbox" checked={form.weekdays.includes(index)} onChange={event => setForm({ ...form, weekdays: event.target.checked ? [...form.weekdays, index] : form.weekdays.filter(value => value !== index) })} />{day}</label>)}</fieldset>
            <div className={styles.products}><p>Enter quantities for the products to deliver. Prices are copied from the customer and saved with this subscription.</p>
              {SUBSCRIPTION_PRODUCTS.map(product => <div className={styles.product} key={product.name}><strong>{product.name}</strong><label>Quantity<input type="number" min="0" max="100000" step="0.001" value={products[product.name]?.quantity ?? ""} onChange={event => setProducts({ ...products, [product.name]: { ...products[product.name], quantity: event.target.value } })} placeholder="0" /></label><label>Price per unit (₹)<input type="number" min="0.01" max="1000000" step="0.01" value={products[product.name]?.rate ?? ""} required={Number(products[product.name]?.quantity) > 0} onChange={event => setProducts({ ...products, [product.name]: { ...products[product.name], rate: event.target.value } })} /></label></div>)}
            </div>
            <label>GST<select value={form.gstType} onChange={event => setForm({ ...form, gstType: event.target.value })}><option value="inclusive">Price includes GST</option><option value="exclusive">Add 5% GST</option></select></label>
            <label className={styles.check}><input type="checkbox" checked={form.affectStockValue} onChange={event => setForm({ ...form, affectStockValue: event.target.checked })} />Deduct stock when orders are generated</label>
            <div className={styles.total}>Per delivery: <strong>{currency(estimate)}</strong></div>
            <button data-button="primary" type="submit" disabled={!items.length || !form.weekdays.length || !form.customerId}>Create subscription</button>
          </fieldset>
        </form>
      </section>

      <section className={styles.panel}><h2>Subscriptions {customerId ? "for this customer" : "for all customers"}</h2>
        {!subscriptions.length ? <p>No subscriptions yet. Choose a customer and a delivery schedule above.</p> : <div className={styles.list}>{subscriptions.map(subscription => <article className={styles.subscription} key={subscription._id}>
          <div className={styles.heading}><h3>{subscription.customerName}</h3><span className={styles.badge} data-status={subscription.status}>{subscription.status}</span></div>
          <p>{subscription.items.map(item => `${item.quantity} × ${item.product} @ ${currency(item.ratePerUnit)}`).join(" · ")}</p>
          <p><strong>{currency(subscriptionOrder(subscription, { _id: subscription.customerId }, subscription.startDate).totalAmount)} per delivery</strong> · {subscription.weekdays.length === 7 ? "Every day" : subscription.weekdays.map(day => DAYS[day]).join(", ")} · {subscription.gstType === "exclusive" ? "Includes 5% GST added to prices" : "GST included"}</p>
          <p>From {formatDateForDisplay(subscription.startDate)}{subscription.endDate ? ` until ${formatDateForDisplay(subscription.endDate)}` : " · No end date"} · {subscription.affectStockValue ? "Deducts stock" : "Does not deduct stock"}</p>
          {subscription.status === "active" && <p>Next date to process: {formatDateForDisplay(subscription.nextDate)}{!subscription.weekdays.includes(new Date(`${subscription.nextDate}T00:00:00Z`).getUTCDay()) ? " (delivery only on selected weekdays)" : ""}</p>}
          {subscription.lastOrderDate && <Link href={`/customer/order?customerId=${subscription.customerId}`}>Last generated order: {formatDateForDisplay(subscription.lastOrderDate)}</Link>}
          {subscription.lastError && <p className={styles.error}>Needs attention: {subscription.lastError}. Correct the issue and generate due orders again.</p>}
          {isAdmin && ["active", "paused"].includes(subscription.status) && <div className={styles.actions}>
            <button data-button="secondary" disabled={busy} onClick={() => action(subscription._id, subscription.status === "active" ? "pause" : "resume")}>{subscription.status === "active" ? "Pause" : "Resume"}</button>
            <button data-button="secondary" disabled={busy} onClick={() => { if (window.confirm("Cancel this subscription? Existing orders will be kept.")) action(subscription._id, "cancel"); }}>Cancel</button>
            <label>Skip a date<input type="date" min={getTodayDate()} value={skipDates[subscription._id] || ""} onChange={event => setSkipDates({ ...skipDates, [subscription._id]: event.target.value })} /></label>
            <button data-button="secondary" disabled={busy || !skipDates[subscription._id]} onClick={() => action(subscription._id, "skip", skipDates[subscription._id])}>Skip date</button>
          </div>}
          {subscription.skipDates?.length > 0 && <div className={styles.skips}>Skipped: {subscription.skipDates.map(date => <span key={date}>{formatDateForDisplay(date)} {isAdmin && ["active", "paused"].includes(subscription.status) && date >= getTodayDate() && <button type="button" disabled={busy} onClick={() => action(subscription._id, "unskip", date)} aria-label={`Restore delivery on ${date}`}>Restore</button>}</span>)}</div>}
        </article>)}</div>}
      </section>
      <section className={styles.panel}><h2>Invoices & payments</h2><p>Subscription orders use your existing invoices and customer payment ledger. Invoice delivery and bank/payment matching are not connected yet; no invoices or messages are sent automatically, and payments are not assumed to be received.</p></section>
    </>}
  </div>;
}

export default function CustomerSubscriptions() {
  return <Suspense fallback={<DataSkeleton label="Loading subscriptions…" />}><SubscriptionsContent /></Suspense>;
}
