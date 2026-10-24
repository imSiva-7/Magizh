const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const safePart = value => String(value || "")
  .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, " ")
  .replace(/\s+/g, " ").trim().replace(/^[. ]+|[. ]+$/g, "").slice(0, 100);

export function readableReportDate(value) {
  const match = String(value || "").match(/^(\d{4})-(0[1-9]|1[0-2])(?:-(\d{2}))?/);
  if (!match) return safePart(value);
  return [match[3], months[Number(match[2]) - 1], match[1]].filter(Boolean).join(" ");
}

export function reportFilename(type, name, dates = []) {
  const sorted = dates.filter(Boolean).map(value => String(value).slice(0, 10)).sort();
  const start = readableReportDate(sorted[0]);
  const end = readableReportDate(sorted.at(-1));
  const period = start === end ? start : `${start} to ${end}`;
  return [safePart(type), safePart(name), period].filter(Boolean).join(" - ") + ".pdf";
}
