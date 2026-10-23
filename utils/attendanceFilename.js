export function attendanceFilename(name, month) {
  const safeName = String(name || "Employee")
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[. ]+|[. ]+$/g, "")
    .slice(0, 100) || "Employee";
  return `${safeName}-${month}.pdf`;
}
