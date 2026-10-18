"use client";

import { useEffect, useRef, useState } from "react";
import { buildGstr1 } from "@/lib/gstr1.mjs";
import { getTodayDate } from "@/utils/dateUtils";
import styles from "./Gstr1Export.module.css";

export default function Gstr1Export({ initialMonth, onClose }) {
  const [month, setMonth] = useState(initialMonth || getTodayDate().slice(0, 7));
  const [gstin, setGstin] = useState("33ACBFM9128J1Z4");
  const [hsnDigits, setHsnDigits] = useState("6");
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState({});
  const [invoices, setInvoices] = useState({});
  const [fingerprints, setFingerprints] = useState({});
  const [defaultPos, setDefaultPos] = useState("");
  const [conflicts, setConflicts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loadedMonth, setLoadedMonth] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const panelRef = useRef(null);
  const requestRef = useRef(null);
  useEffect(() => {
    panelRef.current?.scrollIntoView({ block: "start" });
    panelRef.current?.focus({ preventScroll: true });
    return () => requestRef.current?.abort();
  }, []);

  const load = async () => {
    requestRef.current?.abort();
    const controller = new AbortController(); requestRef.current = controller;
    setLoading(true); setError(""); setReviewed(false); setDownloaded(false); setLoadedMonth("");
    try {
      const response = await fetch(`/api/customer/order/gstr1?month=${encodeURIComponent(month)}`, { signal: controller.signal, cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load orders.");
      if (controller.signal.aborted) return;
      const prefills = data.prefills;
      if (!prefills) throw new Error("Export defaults could not be loaded. Please retry.");
      setOrders(data.orders); setProducts(prefills.products); setInvoices(prefills.invoices);
      setFingerprints(prefills.fingerprints); setGstin(prefills.gstin); setHsnDigits(prefills.hsnDigits);
      setDefaultPos(prefills.defaultPos); setConflicts(prefills.conflicts || []); setLoadedMonth(month);
    } catch (cause) { if (!controller.signal.aborted) setError(cause.message); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  };
  const editProduct = (name, field, value) => { setProducts(previous => ({ ...previous, [name]: { ...previous[name], [field]: value } })); setReviewed(false); setDownloaded(false); };
  const editInvoice = (id, field, value) => { setInvoices(previous => ({ ...previous, [id]: { ...previous[id], [field]: value } })); setReviewed(false); setDownloaded(false); };
  const download = async event => {
    event.preventDefault(); setError("");
    if (saving) return;
    try {
      if (loadedMonth !== month || !reviewed) throw new Error("Load the return month and review the invoice details first.");
      buildGstr1({ gstin, month, orders, products, invoices, hsnDigits });
      setSaving(true);
      const response = await fetch("/api/customer/order/gstr1", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gstin, month, products, invoices, hsnDigits, defaultPos, fingerprints, reviewed: true }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save export details. Please retry.");
      const payload = result.data;
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = `GSTR1_${payload.gstin}_${payload.fp}.json`;
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloaded(true);
    } catch (cause) { setError(cause.message); }
    finally { setSaving(false); }
  };

  return <section data-entry-form ref={panelRef} tabIndex={-1} className={styles.panel} aria-labelledby="gstr1-title">
    <div className={styles.heading}><h2 id="gstr1-title">GSTR-1 JSON export</h2><button data-button="secondary" type="button" onClick={onClose} disabled={saving}>Close GST export</button></div>
    <p className={styles.hint}>Export regular domestic taxable sales for one month, including B2B, B2C and separate HSN summaries. Each order must match one issued invoice. Enter the numbers from your invoice register; no numbers are generated here.</p>
    <fieldset className={styles.settings} disabled={saving}><div className={styles.fields}>
      <label>Supplier GSTIN<input value={gstin} maxLength={15} onChange={event => { setGstin(event.target.value.toUpperCase()); setReviewed(false); }} /></label>
      <label>Return month<input type="month" min="2025-05" max={getTodayDate().slice(0, 7)} value={month} onChange={event => { setMonth(event.target.value); setReviewed(false); setDownloaded(false); }} /></label>
      <label>Minimum HSN digits<select value={hsnDigits} onChange={event => { setHsnDigits(event.target.value); setReviewed(false); }}><option value="6">6 digits (turnover above ₹5 crore)</option><option value="4">4 digits (turnover up to ₹5 crore)</option></select></label>
      <label>Default place of supply for unregistered customers<input value={defaultPos} inputMode="numeric" maxLength={2} placeholder="Two-digit state code" onChange={event => { setDefaultPos(event.target.value); setReviewed(false); setDownloaded(false); }} /></label>
    </div>
    <button data-button="secondary" type="button" disabled={loading || !month} onClick={load}>{loading ? "Loading monthly orders…" : "Load monthly orders"}</button></fieldset>
    {loadedMonth === month && <form onSubmit={download}>
      <fieldset className={styles.settings} disabled={saving}>
      <p className={styles.hint}>{orders.length} orders loaded for {month}. Saved order and customer details and previously confirmed export details are prefilled. Missing invoice numbers and HSNs stay blank. Line amounts are treated as GST-inclusive, as saved by the order forms.</p>
      {conflicts.length > 0 && <div className={styles.error} role="status">{conflicts.map(message => <p key={message}>{message}</p>)}</div>}
      {orders.length > 0 && <>
        <h3>Product tax details</h3>
        <div className={styles.table}><table><thead><tr><th>Product</th><th>HSN</th><th>GST %</th><th>Unit</th></tr></thead><tbody>{Object.entries(products).map(([name, config]) => <tr key={name}><th scope="row">{name}</th><td><input aria-label={`${name} HSN`} value={config.hsn} inputMode="numeric" maxLength={8} onChange={event => editProduct(name, "hsn", event.target.value)} required /></td><td><input aria-label={`${name} GST rate`} type="number" min="0.01" max="40" step="0.01" value={config.rate} onChange={event => editProduct(name, "rate", event.target.value)} required /></td><td><select aria-label={`${name} unit`} value={config.uqc} onChange={event => editProduct(name, "uqc", event.target.value)}><option value="KGS">KGS</option><option value="LTR">LTR</option></select></td></tr>)}</tbody></table></div>
        <h3>Invoice register</h3>
        <p className={styles.hint}>Leave customer GSTIN blank only for unregistered customers. Confirm the two-digit place-of-supply state code for each invoice. Confirmed details are remembered for future exports without changing orders.</p>
        <button data-button="secondary" type="button" disabled={!/^\d{2}$/.test(defaultPos)} onClick={() => { setInvoices(previous => Object.fromEntries(Object.entries(previous).map(([id, meta]) => [id, !meta.gstin && !meta.pos ? { ...meta, pos: defaultPos } : meta]))); setReviewed(false); setDownloaded(false); }}>Fill missing unregistered supply states</button>
        <div className={styles.table}><table><thead><tr><th>Date / Customer</th><th>Invoice number</th><th>Customer GSTIN</th><th>Place of supply</th><th>Invoice total</th></tr></thead><tbody>{orders.map(order => <tr key={order._id}><th scope="row">{order.date}<br />{order.customerName}</th><td><input aria-label={`Invoice number for ${order._id}`} value={invoices[order._id]?.number || ""} maxLength={16} onChange={event => editInvoice(order._id, "number", event.target.value)} required /></td><td><input aria-label={`Customer GSTIN for ${order._id}`} value={invoices[order._id]?.gstin || ""} maxLength={15} onChange={event => editInvoice(order._id, "gstin", event.target.value.toUpperCase())} /></td><td><input aria-label={`Place of supply for ${order._id}`} value={invoices[order._id]?.pos || ""} inputMode="numeric" maxLength={2} onChange={event => editInvoice(order._id, "pos", event.target.value)} required /></td><td>₹{Number(order.totalAmount).toFixed(2)}</td></tr>)}</tbody></table></div>
        <label className={styles.review}><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />I checked invoice numbers, GSTINs, places of supply, HSNs and rates against the issued invoices. These orders are regular domestic taxable sales, with no exempt sales, SEZ supplies, exports or credit/debit notes.</label>
        <button data-button="primary" type="submit" disabled={!reviewed || saving}>{saving ? "Saving export details…" : "Download GSTR-1 JSON"}</button>
      </>}
      </fieldset>
    </form>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {downloaded && <p role="status">JSON downloaded and confirmed export details saved for next time. Import it using Prepare Offline on the GST portal, check the portal validation results, and complete document-series details and any other return sections before filing.</p>}
    <p className={styles.hint}>This export contains sales invoice data, not a filed return. <a href="https://tutorial.gst.gov.in/userguide/returns/Creation_of_Outward_Supplies_Return_in_GSTR-1.htm" target="_blank" rel="noreferrer">GST portal upload instructions</a></p>
  </section>;
}
