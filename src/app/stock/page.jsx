"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import PageHeading from "@/components/PageHeading";
import StockCharts from "@/components/StockCharts";
import { STOCK_PRODUCTS, buildInventory, stockNumber, stockMoney, stockQuantity } from "@/lib/stock";
import styles from "@/css/stock.module.css";

const emptyAdjustment = (product = "butter") => ({ product, direction: "add", quantity: "", comment: "" });
const PRODUCT_NAMES = Object.fromEntries(STOCK_PRODUCTS.map((item) => [item.field, item.name]));
const PRODUCT_UNITS = Object.fromEntries(STOCK_PRODUCTS.map((item) => [item.field, item.unit]));
const MOVEMENT_NAMES = { production: "Production", order: "Customer order", adjustment: "Adjustment", reversal: "Reversal" };

async function readResponse(response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || "Request failed. Please try again.");
  if (data === null) throw new Error("The server returned an invalid response.");
  return data;
}

async function loadStockPart(url, signal) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(cancel, 15000);
  try {
    return await readResponse(await fetch(url, { signal: controller.signal, cache: "no-store" }));
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", cancel);
  }
}

export default function StockPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [panel, setPanel] = useState(null);
  const [filter, setFilter] = useState("all");
  const [adjustment, setAdjustment] = useState(emptyAdjustment);
  const [thresholdDraft, setThresholdDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const requestRef = useRef(null);
  const formRef = useRef(null);
  const busyRef = useRef(false);

  const fetchStockData = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError("");
    try {
      const endpoints = ["/api/stock/balance", "/api/stock/thresholds", "/api/stock/ledger?limit=30", "/api/customer"];
      const results = await Promise.allSettled(endpoints.map((url) => loadStockPart(url, controller.signal)));
      if (controller.signal.aborted) return;
      if (results[0].status === "rejected") throw new Error("Could not load stock balances. Please try again.");
      const balance = results[0].value;
      if (!balance || Array.isArray(balance) || typeof balance !== "object") throw new Error("Stock balances are unavailable. Please try again.");
      const optional = (index) => results[index].status === "fulfilled" ? results[index].value : null;
      const settings = optional(1);
      const ledger = optional(2);
      const customers = optional(3);
      setData({
        balance,
        thresholds: settings?.thresholds && typeof settings.thresholds === "object" && !Array.isArray(settings.thresholds) ? settings.thresholds : settings && !Array.isArray(settings) ? {} : null,
        ledger: Array.isArray(ledger) ? ledger : null,
        customers: Array.isArray(customers) ? customers : null,
      });
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause.message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStockData();
    return () => requestRef.current?.abort();
  }, [fetchStockData]);

  useEffect(() => {
    if (panel) formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [panel]);

  const items = useMemo(() => buildInventory(data?.balance, data?.thresholds ?? null, data?.customers ?? null), [data]);
  const attention = items.filter((item) => item.needsAttention);
  const priced = items.filter((item) => item.estimatedValue !== null);
  const totalValue = priced.length ? priced.reduce((sum, item) => sum + item.estimatedValue, 0) : null;
  const selected = items.find((item) => item.field === adjustment.product);
  const adjustmentAmount = stockNumber(adjustment.quantity);
  const delta = adjustmentAmount === null ? 0 : adjustmentAmount * (adjustment.direction === "remove" ? -1 : 1);
  const nextQuantity = selected?.quantity === null ? null : selected?.quantity + delta;

  const openAdjustment = (product = "butter") => {
    setAdjustment(emptyAdjustment(product));
    setPanel("adjustment");
  };
  const openThresholds = () => {
    setThresholdDraft(Object.fromEntries(STOCK_PRODUCTS.map((item) => [item.field, data?.thresholds?.[item.field] ?? ""])));
    setPanel("thresholds");
  };

  const submitAdjustment = async (event) => {
    event.preventDefault();
    if (busyRef.current) return;
    if (adjustmentAmount === null || adjustmentAmount <= 0) return toast.error("Enter a quantity greater than zero.");
    busyRef.current = true;
    setSaving(true);
    try {
      await readResponse(await fetch("/api/stock/adjust", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: adjustment.product, quantity: delta, comment: adjustment.comment.trim() }),
      }));
      toast.success("Stock adjustment saved");
      setPanel(null);
      setAdjustment(emptyAdjustment());
      await fetchStockData();
    } catch (cause) {
      toast.error(cause.message);
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  };

  const saveThresholds = async (event) => {
    event.preventDefault();
    if (busyRef.current) return;
    const thresholds = { ...data.thresholds };
    for (const product of STOCK_PRODUCTS) {
      const raw = thresholdDraft[product.field];
      const value = String(raw ?? "").trim() === "" ? 0 : stockNumber(raw);
      if (value === null || value < 0) return toast.error("Minimum stock must be zero or greater.");
      thresholds[product.field] = value;
    }
    busyRef.current = true;
    setSaving(true);
    try {
      await readResponse(await fetch("/api/stock/thresholds", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ thresholds }),
      }));
      setData((previous) => ({ ...previous, thresholds }));
      setPanel(null);
      toast.success("Minimum stock levels saved");
    } catch (cause) {
      toast.error(cause.message);
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className={styles.page_container}>
      <ToastContainer position="top-right" autoClose={3000} />
      <div className={styles.header_content}>
        <PageHeading title="Stock Management" section="INVENTORY" description="See what is available, spot low stock, and keep every movement accounted for." />
        <div className={styles.headerActions}>
          <button type="button" className={styles.secondary_btn} onClick={fetchStockData} disabled={loading || saving}>{loading ? "Refreshing…" : "Refresh"}</button>
          <button type="button" className={styles.secondary_btn} onClick={() => panel === "thresholds" ? setPanel(null) : openThresholds()} disabled={!data || data.thresholds === null || loading || saving} aria-expanded={panel === "thresholds"} aria-controls="stock-editor">Minimum levels</button>
          <button type="button" className={styles.primary_btn} onClick={() => panel === "adjustment" ? setPanel(null) : openAdjustment()} disabled={!data || loading || saving} aria-expanded={panel === "adjustment"} aria-controls="stock-editor">+ Adjust stock</button>
        </div>
      </div>

      {error && <div className={styles.errorBanner} role="alert"><span>{error}{data ? " Showing previously loaded data." : ""}</span><button type="button" onClick={fetchStockData} disabled={loading || saving}>Try again</button></div>}
      {loading && !data ? <div className={styles.loadingState} role="status"><span className={styles.spinner} aria-hidden="true" /><p>Loading inventory…</p></div> : data && <>
        {loading && <p className={styles.helper} role="status">Updating inventory…</p>}
        {(data.thresholds === null || data.customers === null || data.ledger === null) && <div className={styles.notice} role="status">Some information could not be loaded: {[data.thresholds === null && "minimum levels", data.customers === null && "customer prices", data.ledger === null && "recent movements"].filter(Boolean).join(", ")}. Refresh to retry.</div>}

        <div className={styles.summaryGrid}>
          <div className={`${styles.summaryCard} ${styles.valueSummary}`}><span>Estimated selling value</span><strong>{stockMoney(totalValue)}</strong><small>{priced.length ? `${priced.length} of ${items.length} products priced` : "Customer prices not available"}</small></div>
          <div className={styles.summaryCard}><span>Products in stock</span><strong>{items.filter((item) => item.quantity > 0).length}<small> / {items.length}</small></strong><small>Products with a positive balance</small></div>
          <div className={styles.summaryCard}><span>Needs attention</span><strong className={attention.length ? styles.warningText : ""}>{attention.length}</strong><small>Low, empty, or negative balances</small></div>
        </div>

        {panel && <section ref={formRef} id="stock-editor" className={styles.panel} aria-labelledby="stock-editor-title">
          <div className={styles.sectionHeading}><h2 id="stock-editor-title">{panel === "adjustment" ? "Adjust a product" : "Minimum stock levels"}</h2><button type="button" className={styles.textButton} onClick={() => setPanel(null)} disabled={saving}>Cancel</button></div>
          {panel === "adjustment" ? <form onSubmit={submitAdjustment}>
            <p className={styles.helper}>Record a correction, opening balance, or stock loss. Add one product at a time.</p>
            <fieldset className={styles.formFields} disabled={saving}>
              <div className={styles.formGrid}>
                <div className={styles.inputGroup}><label htmlFor="adjust-product">Product</label><select id="adjust-product" value={adjustment.product} onChange={(event) => setAdjustment((previous) => ({ ...previous, product: event.target.value }))}>{STOCK_PRODUCTS.map((item) => <option key={item.field} value={item.field}>{item.name} ({item.unit})</option>)}</select></div>
                <div className={styles.inputGroup}><label htmlFor="adjust-direction">Action</label><select id="adjust-direction" value={adjustment.direction} onChange={(event) => setAdjustment((previous) => ({ ...previous, direction: event.target.value }))}><option value="add">Add to stock</option><option value="remove">Remove from stock</option></select></div>
                <div className={styles.inputGroup}><label htmlFor="adjust-quantity">Quantity ({selected.unit})</label><input id="adjust-quantity" type="number" min="0.01" step="0.01" required value={adjustment.quantity} onChange={(event) => setAdjustment((previous) => ({ ...previous, quantity: event.target.value }))} placeholder="0.00" /></div>
              </div>
              <div className={styles.inputGroup}><label htmlFor="adjust-reason">Reason (optional)</label><input id="adjust-reason" value={adjustment.comment} onChange={(event) => setAdjustment((previous) => ({ ...previous, comment: event.target.value }))} placeholder="For example, damaged stock or opening balance" maxLength={500} /></div>
              <div className={styles.adjustmentPreview} aria-live="polite"><span>Current <strong>{stockQuantity(selected.quantity)} {selected.unit}</strong></span><span aria-hidden="true">→</span><span>After adjustment <strong className={nextQuantity < 0 ? styles.warningText : ""}>{stockQuantity(nextQuantity)} {selected.unit}</strong></span></div>
              {nextQuantity < 0 && <p className={styles.warningText}>This adjustment would leave a negative balance. Check the quantity before saving.</p>}
              <div className={styles.formActions}><button type="submit" className={styles.primary_btn} disabled={loading}>{saving ? "Saving…" : "Save adjustment"}</button></div>
            </fieldset>
          </form> : <form onSubmit={saveThresholds}>
            <p className={styles.helper}>Products below these levels are marked as low stock. Use zero or leave blank to unset a minimum.</p>
            <fieldset className={styles.formFields} disabled={saving}>
              <div className={styles.thresholdGrid}>{STOCK_PRODUCTS.map((item) => <div key={item.field} className={styles.inputGroup}><label htmlFor={`minimum-${item.field}`}>{item.name} ({item.unit})</label><input id={`minimum-${item.field}`} type="number" min="0" step="0.01" value={thresholdDraft[item.field] ?? ""} onChange={(event) => setThresholdDraft((previous) => ({ ...previous, [item.field]: event.target.value }))} placeholder="Not set" /></div>)}</div>
              <div className={styles.formActions}><button type="submit" className={styles.primary_btn} disabled={loading}>{saving ? "Saving…" : "Save minimum levels"}</button></div>
            </fieldset>
          </form>}
        </section>}

        <section aria-labelledby="inventory-title" className={styles.inventorySection}>
          <div className={styles.sectionHeading}><h2 id="inventory-title">Product inventory</h2><div className={styles.segmented} role="group" aria-label="Inventory filter"><button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All products</button><button type="button" aria-pressed={filter === "attention"} onClick={() => setFilter("attention")}>Needs attention ({attention.length})</button></div></div>
          <div className={styles.productGrid}>{items.filter((item) => filter === "all" || item.needsAttention).map((item) => <article key={item.field} className={`${styles.productCard} ${item.needsAttention ? styles.attentionCard : ""}`} aria-label={`${item.name} inventory`}>
            <div className={styles.productHeading}><h3>{item.name}</h3><span className={`${styles.badge} ${item.needsAttention ? styles.warningBadge : item.status === "Healthy" ? styles.healthyBadge : ""}`}>{item.status}</span></div>
            <div className={styles.productQuantity}>{stockQuantity(item.quantity)} <span>{item.unit}</span></div>
            <p className={styles.minimum}>{item.minimum === null ? "Minimum unavailable" : item.minimum > 0 ? `Minimum ${stockQuantity(item.minimum)} ${item.unit}` : "No minimum set"}</p>
            <dl className={styles.productDetails}><div><dt>Avg. selling price / {item.unit}</dt><dd>{item.averagePrice === null ? "Not priced" : stockMoney(item.averagePrice)}</dd></div><div><dt>Estimated value</dt><dd>{stockMoney(item.estimatedValue)}</dd></div></dl>
            <button type="button" className={styles.textButton} onClick={() => openAdjustment(item.field)} disabled={saving || loading} aria-label={`Adjust ${item.name}`}>Adjust stock <span aria-hidden="true">↗</span></button>
          </article>)}</div>
          {filter === "attention" && !attention.length && <div className={styles.emptyState}>No products need attention.</div>}
        </section>

        <StockCharts items={items} />

        <section className={styles.panel} aria-labelledby="movement-title">
          <div className={styles.sectionHeading}><h2 id="movement-title">Recent movements</h2><span className={styles.helper}>Latest {data.ledger?.length ?? 0} entries</span></div>
          {data.ledger === null ? <p className={styles.emptyState}>Recent movements could not be loaded. Refresh to retry.</p> : data.ledger.length === 0 ? <p className={styles.emptyState}>No stock movements yet. New production, orders, and adjustments will appear here.</p> : <div className={styles.tableWrapper}><table className={styles.movementTable}><thead><tr><th scope="col">Date</th><th scope="col">Product</th><th scope="col">Movement</th><th scope="col">Quantity</th><th scope="col">Reason</th></tr></thead><tbody>{data.ledger.map((entry, index) => {
            const quantity = stockNumber(entry.quantity);
            const rawDate = entry.date || entry.createdAt;
            const date = rawDate ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? `${rawDate}T00:00:00` : rawDate) : null;
            return <tr key={entry._id || index}><td>{date && Number.isFinite(date.getTime()) ? date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" }) : "—"}</td><td>{PRODUCT_NAMES[entry.product] || entry.product}</td><td><span className={styles.movementType}>{MOVEMENT_NAMES[entry.type] || entry.type}</span></td><td className={quantity < 0 ? styles.warningText : styles.positiveText}>{quantity > 0 ? "+" : ""}{stockQuantity(quantity)} {PRODUCT_UNITS[entry.product] || ""}</td><td className={styles.reasonCell}>{entry.comment || "—"}</td></tr>;
          })}</tbody></table></div>}
        </section>
      </>}
    </div>
  );
}
