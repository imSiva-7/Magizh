import { calculateTotals, exportToPDF, exportToCSV } from "./exportUtils";
import { getProcurementSummary } from "./procurementSummary";
import autoTable from "jspdf-autotable";

const mockDocuments = [];
jest.mock("jspdf", () => {
  const actual = jest.requireActual("jspdf");
  return { jsPDF: function (...args) {
    const doc = new actual.jsPDF(...args);
    doc.save = jest.fn();
    mockDocuments.push(doc);
    return doc;
  } };
});
jest.mock("jspdf-autotable", () => {
  const actual = jest.requireActual("jspdf-autotable");
  return { __esModule: true, default: jest.fn((...args) => actual.default(...args)) };
});

const records = [
  { date: "2026-11-05", time: "AM", supplierName: "Test Farm", milkQuantity: "10", fatPercentage: "4.25", snfPercentage: "8.56", rate: "44.98", totalAmount: 449.8, supplierTSRate: 350 },
  { date: "2026-11-05", time: "PM", supplierName: "Test Farm", milkQuantity: 90, fatPercentage: 3.75, snfPercentage: 8.10, rate: 45.67, totalAmount: 4110.3, supplierTSRate: 350 },
];
const range = { start: "2026-11-05", end: "2026-11-05" };
beforeEach(() => { mockDocuments.length = 0; jest.clearAllMocks(); });

test("export totals match the page summary for numeric strings and unequal collection volumes", () => {
  const summary = getProcurementSummary(records);
  expect(calculateTotals(records)).toEqual({ totalMilk: summary.milk, totalAmount: summary.amount, avgFat: 3.80, avgSnf: 8.15, avgRate: 45.5 });
  expect(calculateTotals([])).toEqual({ totalMilk: 0, totalAmount: 0, avgFat: 0, avgSnf: 0, avgRate: 0 });
});

test.each([true, false])("PDF uses weighted summaries and normalized collection prices (single supplier: %s)", single => {
  exportToPDF(records, single ? { supplierName: "Test Farm" } : null, range);
  const body = autoTable.mock.calls[0][1].body;
  expect(body[0].slice(-2)).toEqual(["44.9", "449.00"]);
  expect(body[1].slice(-2)).toEqual(["45.6", "4,104.00"]);
  const pdf = mockDocuments[0].output();
  for (const text of ["3.80%", "8.15%", "4,550.00"]) expect(pdf).toContain(text);
  expect(mockDocuments[0].save).toHaveBeenCalledTimes(1);
  if (process.env.SUPPLIER_PDF_PREVIEW && single) {
    const fs = require("node:fs"), path = require("node:path");
    fs.mkdirSync(path.dirname(process.env.SUPPLIER_PDF_PREVIEW), { recursive: true });
    fs.writeFileSync(process.env.SUPPLIER_PDF_PREVIEW, Buffer.from(mockDocuments[0].output("arraybuffer")));
  }
});

test("PDF preserves custom collection rates to two decimals", () => {
  exportToPDF([{ ...records[0], customRate: true, rate: 44.98 }], { supplierName: "Test Farm" }, range);
  expect(autoTable.mock.calls[0][1].body[0].slice(-2)).toEqual(["44.98", "449.80"]);
});

test("CSV agrees with PDF and page summaries without calling toFixed on numeric strings", async () => {
  let blob;
  const link = { setAttribute: jest.fn(), style: {}, click: jest.fn() };
  const originalDocument = global.document, originalCreate = URL.createObjectURL;
  global.document = { createElement: () => link, body: { appendChild: jest.fn(), removeChild: jest.fn() } };
  URL.createObjectURL = value => { blob = value; return "blob:test"; };
  try {
    exportToCSV(records, { supplierName: "Test Farm" }, range);
    const csv = await blob.text();
    for (const text of ["10.00,4.25,8.56,44.9,449.00", "Average FAT,3.80%", "Average SNF,8.15%", "Total Amount,Rs 4550.00"]) expect(csv).toContain(text);
  } finally { global.document = originalDocument; URL.createObjectURL = originalCreate; }
});
