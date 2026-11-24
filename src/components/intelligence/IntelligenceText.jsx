import { formatDateForDisplay } from "@/lib/india-date.mjs";

export const SETUP_TEXT = "AI isn’t configured for this workspace. Ask your workspace admin to connect a provider.";

export function IntelligenceIcon() {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3.5c0 4.5 2.5 7 7 7-4.5 0-7 2.5-7 7 0-4.5-2.5-7-7-7 4.5 0 7-2.5 7-7ZM19 15v5m-2.5-2.5h5M5 15.5v4m-2-2h4" />
  </svg>;
}

export function sourcePeriod(source) {
  if (source.asOfDate) return `as of ${formatDateForDisplay(source.asOfDate)}`;
  const start = formatDateForDisplay(source.startDate);
  const end = formatDateForDisplay(source.throughDate);
  return start === end ? end : `${start}–${end}`;
}

export async function intelligenceRequest({ overview = false, body, signal } = {}) {
  let response;
  try {
    response = await fetch(`/api/intelligence${overview ? "?overview=1" : ""}`, {
      cache: "no-store", signal, ...(body ? {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      } : {}),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error("Couldn’t reach Magizh Intelligence. Check your connection and try again.");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    const error = new Error(data?.error || "Magizh Intelligence is temporarily unavailable. Please try again.");
    error.code = data?.code;
    throw error;
  }
  return data;
}
