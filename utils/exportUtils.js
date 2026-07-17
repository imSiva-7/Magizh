import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDateForDisplay } from "./dateUtils";

// ========== UTILITY FUNCTIONS ==========
const formatNumberWithCommas = (value, decimals = 2) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return (0).toFixed(decimals);
  return num.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

const formatDateForCSV = (dateStr) => {
  const date = new Date(dateStr);
  return `${date.getDate().toString().padStart(2, "0")}-${(date.getMonth() + 1)
    .toString()
    .padStart(2, "0")}-${date.getFullYear().toString().slice(-2)}`;
};

const calculateTotals = (procurements) => {
  if (!procurements.length) {
    return { totalMilk: 0, totalAmount: 0, avgFat: 0, avgSnf: 0, avgRate: 0 };
  }

  const totals = procurements.reduce(
    (acc, record) => ({
      totalMilk: acc.totalMilk + (record.milkQuantity || 0),
      totalAmount: acc.totalAmount + (record.totalAmount || 0),
      totalFat: acc.totalFat + (record.fatPercentage || 0),
      totalSnf: acc.totalSnf + (record.snfPercentage || 0),
    }),
    { totalMilk: 0, totalAmount: 0, totalFat: 0, totalSnf: 0 },
  );

  return {
    totalMilk: totals.totalMilk,
    totalAmount: totals.totalAmount,
    avgFat: totals.totalFat / procurements.length,
    avgSnf: totals.totalSnf / procurements.length,
    avgRate: totals.totalMilk > 0 ? totals.totalAmount / totals.totalMilk : 0,
  };
};

// ========== PDF DESIGN CONSTANTS (MODERN & MINIMAL) ==========
const BRAND_GREEN = [39, 121, 93];        // Primary brand color
const BRAND_LIGHT = [234, 245, 241];      // Light green background
const TEXT_PRIMARY = [30, 41, 59];        // Dark slate
const TEXT_SECONDARY = [100, 116, 139];   // Muted gray
const DIVIDER = [226, 232, 240];          // Light divider
const WHITE = [255, 255, 255];
const TABLE_ALT = [248, 250, 252];        // Alternating row color

// ========== PDF EXPORT ==========
export const exportToPDF = (procurements, supplier, dateRange, fileName) => {
  if (!procurements.length) {
    alert("No data to export");
    return;
  }

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const marginBottom = 20;

  // ========== HEADER SECTION (MODERN DESIGN) ==========
  // Top accent bar
  doc.setFillColor(...BRAND_GREEN);
  doc.rect(0, 0, pageWidth, 3, "F");

  // Company header background
  doc.setFillColor(...BRAND_LIGHT);
  doc.rect(0, 3, pageWidth, 32, "F");

  // Company name
  doc.setTextColor(...BRAND_GREEN);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.text("MAGIZH AGRO PRODUCT", margin, 15);

  // Company details
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...TEXT_SECONDARY);
  doc.text("GUDIYATHAM | GST NO:33ACBFM9128J1Z4", margin, 22);
  doc.text("Phone: +91 93636 46314, +91 75021 36314", margin, 28);

  // Bill Period Box (Modern card design)
  doc.setFillColor(...WHITE);
  doc.setDrawColor(...DIVIDER);
  doc.setLineWidth(0.5);
  doc.roundedRect(pageWidth - 68, 8, 56, 22, 3, 3, "FD");

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BRAND_GREEN);
  doc.text("BILL PERIOD", pageWidth - 65, 14);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...TEXT_PRIMARY);
  doc.text(`From: ${dateRange.start}`, pageWidth - 65, 20);
  doc.text(`To:     ${dateRange.end}`, pageWidth - 65, 26);

  // ========== SUPPLIER DETAILS SECTION (CLEAN CARD) ==========
  const infoStartY = 42;

  doc.setDrawColor(...DIVIDER);
  doc.setLineWidth(0.5);
  doc.setFillColor(...WHITE);
  doc.roundedRect(margin, infoStartY, pageWidth - margin * 2, 24, 3, 3, "FD");

  doc.setTextColor(...BRAND_GREEN);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("SUPPLIER DETAILS", margin + 5, infoStartY + 8);

  // Supplier information
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_PRIMARY);
  
  if (supplier?.supplierName || supplier) {
    doc.text(`Name: ${supplier.supplierName || supplier}`, margin + 5, infoStartY + 15);
  }

  if (supplier?.supplierCustomRate) {
    doc.text(
      `Custom Rate in Rs: ${supplier.supplierCustomRate}`,
      margin + 5,
      infoStartY + 20,
    );
  }

  if (supplier?.supplierTSRate && !supplier?.supplierCustomRate) {
    doc.text(
      `Total Solids Rate: ${supplier.supplierTSRate}`,
      margin + 5,
      infoStartY + 20,
    );
  }

  // ========== TABLE SECTION (MODERN STYLING) ==========
  const headers = [
    ["Date", "Time", "Qty (Ltr)", "FAT %", "SNF %", "TS Rate", "Rate/L", "Amount (Rs)"]
  ];

  const headersWithSupplierName = [
    ["Date", "Time", "Supplier Name", "Qty (Ltr)", "FAT %", "SNF %", "TS Rate", "Rate/L", "Amount (Rs)"]
  ];

  const tableData = [];
  let totalMilkLtr = 0;
  let totalAmount = 0;
  let totalFat = 0;
  let totalSnf = 0;

  // Sort procurements
  const sortedProcurements = [...procurements].sort((a, b) => {
    const dateCompare = new Date(a.date) - new Date(b.date);
    if (dateCompare !== 0) return dateCompare;
    return (a.time === "AM" ? -1 : 1) - (b.time === "AM" ? -1 : 1);
  });
  
  let uniqueDates = new Set();

  sortedProcurements.forEach((record) => {
    if (supplier?.supplierName) {
      tableData.push([
        !uniqueDates.has(record.date) ? formatDateForCSV(record.date) : "",
        record.time || "AM",
        formatNumberWithCommas(record.milkQuantity, 2),
        parseFloat(record.fatPercentage).toFixed(1),
        parseFloat(record.snfPercentage).toFixed(1),
        record.supplierTSRate || "N/A",
        formatNumberWithCommas(record.rate, 2),
        formatNumberWithCommas(record.totalAmount, 2),
      ]);
    } else {
      tableData.push([
        !uniqueDates.has(record.date) ? formatDateForCSV(record.date) : "",
        record.time || "AM",
        record.supplierName || "Unknown",
        formatNumberWithCommas(record.milkQuantity, 2),
        parseFloat(record.fatPercentage).toFixed(1),
        parseFloat(record.snfPercentage).toFixed(1),
        record.supplierTSRate || "N/A",
        record.rate,
        formatNumberWithCommas(record.totalAmount, 2),
      ]);
    }

    totalMilkLtr += record.milkQuantity;
    totalAmount += record.totalAmount;
    totalFat += record.fatPercentage;
    totalSnf += record.snfPercentage;
    uniqueDates.add(record.date);
  });

  autoTable(doc, {
    head: supplier?.supplierName ? headers : headersWithSupplierName,
    body: tableData,
    startY: infoStartY + 28,
    theme: "plain",
    margin: { bottom: marginBottom },
    styles: {
      fontSize: 9,
      cellPadding: 3,
      valign: "middle",
      lineColor: DIVIDER,
      lineWidth: 0.3,
      textColor: TEXT_PRIMARY,
    },
    headStyles: {
      fillColor: BRAND_GREEN,
      textColor: WHITE,
      fontStyle: "bold",
      halign: "center",
      fontSize: 9,
    },
    columnStyles: supplier?.supplierName
      ? {
          0: { halign: "center", cellWidth: 22 },
          1: { halign: "center", cellWidth: 15 },
          2: { halign: "right" },
          3: { halign: "right", fontStyle: "bold" },
          4: { halign: "right" },
          5: { halign: "right" },
          6: { halign: "right" },
          7: { halign: "right", fontStyle: "bold" },
        }
      : {
          0: { halign: "center", cellWidth: 20 },
          1: { halign: "center", cellWidth: 14 },
          2: { halign: "left", fontStyle: "bold" },
          3: { halign: "right", fontStyle: "bold" },
          4: { halign: "right" },
          5: { halign: "right" },
          6: { halign: "right" },
          7: { halign: "right" },
          8: { halign: "right", fontStyle: "bold" },
        },
    alternateRowStyles: {
      fillColor: TABLE_ALT,
    },
  });

  // ========== SUMMARY & TOTALS SECTION (MODERN CARD) ==========
  let finalY = doc.lastAutoTable.finalY + 12;
  const requiredSpace = 100;

  if (finalY + requiredSpace > pageHeight) {
    doc.addPage();
    finalY = 20;
  }

  // Calculate Averages
  const avgFat = (totalFat / procurements.length).toFixed(2);
  const avgSnf = (totalSnf / procurements.length).toFixed(2);
  const avgRate = totalMilkLtr > 0 ? totalAmount / totalMilkLtr : 0;

  // Summary Box (Modern card with shadow effect)
  const summaryWidth = 92;
  const summaryX = pageWidth - summaryWidth - margin;

  // Card background
  doc.setFillColor(...WHITE);
  doc.setDrawColor(...DIVIDER);
  doc.setLineWidth(0.5);
  doc.roundedRect(summaryX, finalY - 5, summaryWidth, 52, 3, 3, "FD");

  // Card header
  doc.setFillColor(...BRAND_LIGHT);
  doc.roundedRect(summaryX, finalY - 5, summaryWidth, 10, 3, 3, "F");

  doc.setTextColor(...BRAND_GREEN);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("PAYMENT SUMMARY", summaryX + 5, finalY + 2);

  // Summary rows
  const drawSummaryRow = (label, value, y, isBold = false) => {
    doc.setFont("helvetica", isBold ? "bold" : "normal");
    doc.setTextColor(...TEXT_PRIMARY);
    doc.setFontSize(9);
    doc.text(label, summaryX + 5, y);
    doc.text(value, pageWidth - margin - 5, y, { align: "right" });
  };

  drawSummaryRow(
    "Total Milk:",
    `${formatNumberWithCommas(totalMilkLtr, 2)} Ltr`,
    finalY + 11,
  );
  drawSummaryRow("Avg FAT:", `${avgFat} %`, finalY + 18);
  drawSummaryRow("Avg SNF:", `${avgSnf} %`, finalY + 25);
  drawSummaryRow(
    "Avg Rate:",
    `Rs. ${formatNumberWithCommas(avgRate, 2)}`,
    finalY + 32,
  );

  // Grand Total (Highlighted)
  doc.setFillColor(...BRAND_GREEN);
  doc.roundedRect(summaryX, finalY + 38, summaryWidth, 9, 2, 2, "F");
  
  doc.setTextColor(...WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("NET PAYABLE", summaryX + 5, finalY + 44);
  doc.text(
    `Rs. ${formatNumberWithCommas(totalAmount, 2)}`,
    pageWidth - margin - 5,
    finalY + 44,
    { align: "right" },
  );

  // ========== FOOTER SECTION (PROFESSIONAL) ==========
  const footerY = finalY + 63;

  if (footerY > pageHeight - 15) {
    doc.addPage();
  }

  doc.setTextColor(...TEXT_PRIMARY);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");

  // Signature Lines (Clean design)
  const sigY = footerY;
  doc.setDrawColor(...DIVIDER);
  doc.setLineWidth(0.5);

  // Prepared By
  doc.line(margin + 5, sigY, margin + 55, sigY);
  doc.text("Prepared By", margin + 30, sigY + 5, { align: "center" });

  // Verified By
  doc.line(pageWidth / 2 - 25, sigY, pageWidth / 2 + 25, sigY);
  doc.text("Verified By", pageWidth / 2, sigY + 5, { align: "center" });

  // Receiver
  doc.line(pageWidth - margin - 55, sigY, pageWidth - margin - 5, sigY);
  doc.text("Receiver Signature", pageWidth - margin - 30, sigY + 5, { align: "center" });

  // Timestamp footer (Bottom bar)
  doc.setFillColor(...BRAND_GREEN);
  doc.rect(0, pageHeight - 10, pageWidth, 3, "F");

  doc.setFontSize(7);
  doc.setTextColor(...TEXT_SECONDARY);
  doc.text(
    `Generated on: ${new Date().toLocaleString("en-IN")}`,
    pageWidth / 2,
    pageHeight - 4,
    { align: "center" },
  );

  doc.save(`${fileName || "procurement_bill"}.pdf`);
};

// ========== CSV EXPORT (PRESERVED AS IS) ==========
export const exportToCSV = (procurements, supplier, dateRange, fileName) => {
  if (!procurements.length) {
    alert("No data to export");
    return;
  }
  
  const sortedProcurements = [...procurements].sort((a, b) => {
    const dateCompare = new Date(a.date) - new Date(b.date);
    if (dateCompare !== 0) return dateCompare;
    return (a.time === "AM" ? -1 : 1) - (b.time === "AM" ? -1 : 1);
  });
  
  const headers = [
    "Date",
    "AM/PM",
    "Quantity (Ltr)",
    "FAT %",
    "SNF %",
    "Rate/L (Rs)",
    "Net Amount (Rs)",
  ];
  
  const csvRows = [];
  csvRows.push(
    `Supplier Name: "${supplier?.supplierName || "MAGIZH DAIRY SUPPLIERS"}"`,
  );
  csvRows.push(
    `"MILK BILL Date: ${formatDateForCSV(
      dateRange.start,
    )} to ${formatDateForCSV(dateRange.end)}"`,
  );
  csvRows.push("");
  csvRows.push(headers.join(","));
  
  let totalMilkLtr = 0;
  let totalAmount = 0;
  let totalFat = 0;
  let totalSnf = 0;
  
  sortedProcurements.forEach((record) => {
    const row = [
      formatDateForCSV(record.date),
      record.time || "AM",
      record.milkQuantity.toFixed(2),
      record.fatPercentage.toFixed(2),
      record.snfPercentage.toFixed(2),
      record.rate.toFixed(2),
      record.totalAmount.toFixed(2),
    ];
    csvRows.push(row.join(","));
    totalMilkLtr += record.milkQuantity;
    totalAmount += record.totalAmount;
    totalFat += record.fatPercentage;
    totalSnf += record.snfPercentage;
  });
  
  csvRows.push("");
  csvRows.push("SUMMARY");
  csvRows.push(`Average FAT,${(totalFat / procurements.length).toFixed(2)}%`);
  csvRows.push(`Average SNF,${(totalSnf / procurements.length).toFixed(2)}%`);
  csvRows.push(`Average Rate/L,Rs ${(totalAmount / totalMilkLtr).toFixed(2)}`);
  csvRows.push(`Total Milk (Ltr),${totalMilkLtr.toFixed(2)}`);
  csvRows.push(`Total Amount,Rs ${totalAmount.toFixed(2)}`);

  const csvContent = csvRows.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", `${fileName || "procurement"}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export { calculateTotals };
