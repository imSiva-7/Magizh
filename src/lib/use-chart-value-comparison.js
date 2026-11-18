import { useEffect, useMemo, useState } from "react";

export function useChartValueComparison(endpoint, rows, monthly, filters) {
  const [series, setSeries] = useState(null);
  const { startDate = "", endDate = "" } = filters;
  const url = endpoint ? `${endpoint}?${new URLSearchParams({ startDate, endDate })}` : null;

  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    fetch(url, { signal: controller.signal, cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!controller.signal.aborted && Array.isArray(data?.daily)) {
          setSeries({ url, daily: data.daily });
        }
      })
      .catch(() => { /* The primary chart can render without the comparison. */ });
    return () => controller.abort();
  }, [url]);

  return useMemo(() => {
    if (!url || series?.url !== url) return rows;
    const values = new Map();
    for (const { date, amount } of series.daily) {
      if (typeof date !== "string") continue;
      const period = date.slice(0, monthly ? 7 : 10);
      values.set(period, (values.get(period) || 0) + (Number(amount) || 0));
    }
    if (!rows.some((row) => values.has(row.date))) return rows;
    return rows.map((row) => ({ ...row, comparisonValue: values.get(row.date) ?? 0 }));
  }, [monthly, rows, series, url]);
}
