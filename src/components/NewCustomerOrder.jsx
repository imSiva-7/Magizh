"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import CategoryBadge from "./CategoryBadge";
import { getTodayDate } from "@/utils/dateUtils";
import { formatNumberWithCommas } from "@/utils/formatNumberWithComma";
import styles from "./NewCustomerOrder.module.css";

const PRODUCTS = [
  { name: "Milk", price: "milkPrice", unit: "L" },
  { name: "Butter", price: "butterPrice", unit: "kg" },
  { name: "Fresh Cream", price: "freshCreamPrice", unit: "kg" },
  { name: "Curd", price: "curdPrice", unit: "kg" },
  { name: "Ghee", price: "gheePrice", unit: "L" },
  { name: "Soft Paneer", price: "softPaneerPrice", unit: "kg" },
  { name: "Premium Paneer", price: "premiumPaneerPrice", unit: "kg" },
];
const money = value => `₹${formatNumberWithCommas(value)}`;
const round = value => Math.round((value + Number.EPSILON) * 100) / 100;

export default function NewCustomerOrder({ onClose, onCreated }) {
  const { data: session } = useSession();
  const panelRef = useRef(null);
  const searchRef = useRef(null);
  const dateRef = useRef(null);
  const busy = useRef(false);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState("");
  const [customer, setCustomer] = useState(null);
  const [date, setDate] = useState(getTodayDate);
  const [quantities, setQuantities] = useState({});
  const [gstType, setGstType] = useState("inclusive");
  const [affectStock, setAffectStock] = useState(false);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    panelRef.current?.scrollIntoView({ block: "start" });
    searchRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setLoadError("");
    fetch("/api/customer", { signal: controller.signal, cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("Customers could not be loaded.");
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error("Customers could not be loaded.");
      if (!controller.signal.aborted) setCustomers(data);
    }).catch(cause => { if (!controller.signal.aborted) setLoadError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload]);

  useEffect(() => { if (customer) dateRef.current?.focus(); else searchRef.current?.focus(); }, [customer]);

  const matches = useMemo(() => {
    const search = query.trim().toLowerCase();
    return customers.filter(row => !search || [row.customerName, row.customerType, row.customerNumber].some(value => String(value || "").toLowerCase().includes(search))).slice(0, 8);
  }, [customers, query]);

  const lines = PRODUCTS.map(product => {
    const rate = Number(customer?.[product.price]);
    const quantity = Number(quantities[product.name] || 0);
    const priced = Number.isFinite(rate) && rate > 0;
    return { ...product, rate, quantity, priced, amount: priced && Number.isFinite(quantity) ? round(rate * quantity * (gstType === "exclusive" ? 1.05 : 1)) : 0 };
  });
  const total = round(lines.reduce((sum, line) => sum + line.amount, 0));

  const submit = async event => {
    event.preventDefault();
    if (busy.current) return;
    setError("");
    if (!customer) { setError("Choose a customer first."); return; }
    if (!date || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || date > getTodayDate()) { setError("Choose a valid order date, up to today."); return; }
    if (lines.some(line => !Number.isFinite(line.quantity) || line.quantity < 0)) { setError("Quantities must be zero or greater."); return; }
    const selected = lines.filter(line => line.quantity > 0);
    if (!selected.length) { setError("Enter a quantity for at least one product."); return; }
    if (selected.some(line => !line.priced)) { setError("Ask an admin to set the missing customer prices."); return; }
    if (!Number.isFinite(total) || total <= 0) { setError("Check the quantities and order total."); return; }
    busy.current = true; setSaving(true);
    try {
      const response = await fetch("/api/customer/order", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: customer._id, customerName: customer.customerName, customerType: customer.customerType,
          date, items: selected.map(line => ({ product: line.name, quantity: line.quantity, ratePerUnit: line.rate, totalAmount: line.amount })),
          totalAmount: total, gstType, gstRate: 5, affectStockValue: affectStock, comment: comment.trim(), paymentStatus: "Not Paid", actionDoneBy: session?.user?.email || "" }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "The order could not be saved. Please try again.");
      onCreated(date);
    } catch (cause) { setError(cause.message); }
    finally { busy.current = false; setSaving(false); }
  };

  return <section id="new-customer-order" ref={panelRef} className={styles.panel} aria-labelledby="new-customer-order-title" aria-describedby="new-customer-order-description" onKeyDown={event => { if (event.key === "Escape" && !busy.current) { event.preventDefault(); onClose(); } }}>
    <div className={styles.header}><h2 id="new-customer-order-title">New order</h2><button data-button="icon" type="button" className={styles.close} aria-label="Close new order" onClick={onClose} disabled={saving}>✕</button></div>
    <div className={styles.body}>
      <p id="new-customer-order-description" className={styles.hint}>Choose a customer and enter quantities using their saved prices.</p>
      {!customer ? <section aria-label="Choose customer">
        <label className={styles.field}>Search customers<input ref={searchRef} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, type, or phone" /></label>
        {loading ? <p role="status">Loading customers…</p> : loadError ? <p role="alert">{loadError} <button data-button="secondary" type="button" className={styles.textButton} onClick={() => setReload(value => value + 1)}>Retry customers</button></p> : matches.length ? <ul className={styles.customers}>{matches.map(row => <li key={row._id}><button data-button="choice" type="button" onClick={() => { setCustomer(row); setQuantities({}); setError(""); }}><span><strong>{row.customerName}</strong><small>{row.customerNumber || "No phone saved"}</small></span><CategoryBadge kind="customer" value={row.customerType} /></button></li>)}</ul> : <p>No customers match. Try another name or phone number.</p>}
        {!loading && !loadError && customers.length > 8 && <p className={styles.hint}>Showing up to 8 matches. Search to narrow the list.</p>}
      </section> : <>
        <div className={styles.selected}><div><strong>{customer.customerName}</strong><small>{customer.customerNumber}</small></div><button data-button="ghost" type="button" className={styles.textButton} onClick={() => { setCustomer(null); setQuantities({}); setError(""); }} disabled={saving}>Change customer</button></div>
        <form id="history-new-order" onSubmit={submit}>
          <fieldset className={styles.fields} disabled={saving}>
            <div className={styles.options}><label className={styles.field}>Order date<input ref={dateRef} type="date" value={date} onChange={event => setDate(event.target.value)} max={getTodayDate()} required /></label><div className={styles.field}><label htmlFor="history-order-gst">GST</label><select id="history-order-gst" value={gstType} onChange={event => setGstType(event.target.value)}><option value="inclusive">Prices include GST</option><option value="exclusive">Add GST (5%)</option></select></div></div>
            <div className={styles.products}>{lines.map(line => <div key={line.name} className={styles.product}><div><label htmlFor={`new-order-${line.price}`}>{line.name}</label><small>{line.priced ? `${money(line.rate)} / ${line.unit}` : "No price set"}</small></div><input id={`new-order-${line.price}`} aria-label={`${line.name} quantity (${line.unit})`} type="number" min="0" step="0.01" inputMode="decimal" value={quantities[line.name] || ""} onChange={event => setQuantities(previous => ({ ...previous, [line.name]: event.target.value }))} disabled={!line.priced} placeholder={`0 ${line.unit}`} /><output aria-label={`${line.name} amount`}>{money(line.amount)}</output></div>)}</div>
            {lines.some(line => !line.priced) && <p className={styles.hint}>Products without a price are unavailable. Ask an admin to set their prices.</p>}
            <label className={styles.field}>Comment (optional)<textarea rows={2} maxLength={1000} value={comment} onChange={event => setComment(event.target.value)} /></label>
            <label className={styles.checkbox}><input type="checkbox" checked={affectStock} onChange={event => setAffectStock(event.target.checked)} />Deduct quantities from stock</label>
            <p className={styles.hint}>Record partial or full payments separately on Customer Payments.</p>
          </fieldset>
        </form>
      </>}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </div>
    <div className={styles.footer}><div><span>Order total</span><strong aria-live="polite">{money(total)}</strong></div><div className={styles.actions}><button data-button="secondary" type="button" className={styles.cancel} disabled={saving} onClick={onClose}>Cancel</button><button data-button="primary" type="submit" form="history-new-order" className={styles.save} disabled={!customer || saving}>{saving ? "Saving…" : "Save order"}</button></div></div>
  </section>;
}
