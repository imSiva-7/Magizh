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
const ACCENT_GOLD = [251, 188, 4];        // Gold accent for highlights
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

  // ========== HEADER SECTION (MINIMAL & MODERN - MATCHING INVOICE) ==========
  // Top accent bar
  doc.setFillColor(...BRAND_GREEN);
  doc.rect(0, 0, pageWidth, 3, "F");

  // Company name with modern typography
  doc.setTextColor(...BRAND_GREEN);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.text("MAGIZH AGRO PRODUCT", margin, 18);

  // Tagline with elegant style
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_SECONDARY);
  doc.text("Your Premium Dairy Partner", margin + 1, 24);

  // Company details on the right (minimal)
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_PRIMARY);
  doc.setFont("helvetica", "normal");
  doc.text("GSTIN: 33ACBFM9128J1Z4", pageWidth - margin, 15, { align: "right" });
  doc.text("Gudiyatham, Tamil Nadu", pageWidth - margin, 20, { align: "right" });
  doc.text("+91 93636 46314", pageWidth - margin, 25, { align: "right" });

  // Procurement Bill title banner
  doc.setFillColor(...BRAND_LIGHT);
  doc.roundedRect(margin, 38, pageWidth - margin * 2, 12, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...BRAND_GREEN);
  doc.text("PROCUREMENT BILL", pageWidth / 2, 46, { align: "center" });

  // ========== SUPPLIER & BILL DETAILS (CLEAN GRID - MATCHING INVOICE) ==========
  const infoStartY = 56;
  const boxHeight = 40;
  const boxWidth = (pageWidth - margin * 3) / 2;

  // Left box - Supplier Details
  doc.setDrawColor(...DIVIDER);
  doc.setLineWidth(0.5);
  doc.roundedRect(margin, infoStartY, boxWidth, boxHeight, 3, 3);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...BRAND_GREEN);
  doc.text("SUPPLIER DETAILS", margin + 5, infoStartY + 8);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...TEXT_PRIMARY);
  doc.text(
    supplier?.supplierName || "All Suppliers",
    margin + 5,
    infoStartY + 16
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_SECONDARY);

  let detailY = infoStartY + 23;
  
  if (supplier?.supplierCustomRate) {
    doc.text(`Custom Rate: Rs. ${supplier.supplierCustomRate}/L`, margin + 5, detailY);
    detailY += 5;
  }

  if (supplier?.supplierTSRate && !supplier?.supplierCustomRate) {
    doc.text(`TS Rate: ${supplier.supplierTSRate}`, margin + 5, detailY);
    detailY += 5;
  }

  // Right box - Bill Details
  const rightBoxX = margin * 2 + boxWidth;
  doc.roundedRect(rightBoxX, infoStartY, boxWidth, boxHeight, 3, 3);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...BRAND_GREEN);
  doc.text("BILL DETAILS", rightBoxX + 5, infoStartY + 8);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_PRIMARY);

  doc.text("Bill Date:", rightBoxX + 5, infoStartY + 16);
  doc.setFont("helvetica", "bold");
  doc.text(formatDateForDisplay(new Date()), rightBoxX + 30, infoStartY + 16);

  doc.setFont("helvetica", "normal");
  doc.text("Period:", rightBoxX + 5, infoStartY + 22);
  doc.setFont("helvetica", "bold");
  const periodText = dateRange.start === dateRange.end
    ? dateRange.start
    : `${dateRange.start} - ${dateRange.end}`;
  const splitPeriod = doc.splitTextToSize(periodText, boxWidth - 40);
  doc.text(splitPeriod, rightBoxX + 30, infoStartY + 22);

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
    startY: infoStartY + 44,
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
      cellPadding: { top: 4, bottom: 4, left: 3, right: 3 },
    },
    bodyStyles: {
      cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
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

  // ========== SUMMARY & TOTALS SECTION (MODERN CARD - MATCHING INVOICE) ==========
  let finalY = doc.lastAutoTable.finalY + 10;
  const requiredSpace = 80;

  if (finalY + requiredSpace > pageHeight) {
    doc.addPage();
    finalY = 20;
  }

  // Calculate Averages
  const avgFat = (totalFat / procurements.length).toFixed(2);
  const avgSnf = (totalSnf / procurements.length).toFixed(2);
  const avgRate = totalMilkLtr > 0 ? totalAmount / totalMilkLtr : 0;

  // Summary card on the right (matching invoice style)
  const summaryWidth = 92;
  const summaryX = pageWidth - summaryWidth - margin;

  // Card background with increased height to include metrics
  doc.setDrawColor(...DIVIDER);
  doc.setLineWidth(0.5);
  doc.roundedRect(summaryX, finalY - 5, summaryWidth, 72, 3, 3);

  // Helper function for summary rows
  const drawSummaryRow = (label, value, y, isBold = false) => {
    doc.setFont("helvetica", isBold ? "bold" : "normal");
    doc.setTextColor(...TEXT_PRIMARY);
    doc.setFontSize(10);
    doc.text(label, summaryX + 5, y);
    doc.text(value, pageWidth - margin - 5, y, { align: "right" });
  };

  // Milk Metrics Section (above subtotal, same styling)
  let currentY = finalY + 5;
  
  drawSummaryRow(
    "Total Milk",
    `${formatNumberWithCommas(totalMilkLtr, 2)} Ltr`,
    currentY,
  );
  currentY += 7;
  
  drawSummaryRow(
    "Avg FAT",
    `${avgFat}%`,
    currentY,
  );
  currentY += 7;
  
  drawSummaryRow(
    "Avg SNF",
    `${avgSnf}%`,
    currentY,
  );
  currentY += 7;
  
  drawSummaryRow(
    "Avg Rate",
    `Rs. ${formatNumberWithCommas(avgRate, 2)}/L`,
    currentY,
  );
  currentY += 9;

  // Divider after metrics
  doc.setDrawColor(...DIVIDER);
  doc.line(summaryX + 5, currentY, pageWidth - margin - 5, currentY);
  currentY += 7;

  // Subtotal
  drawSummaryRow(
    "Subtotal",
    `Rs. ${formatNumberWithCommas(totalAmount, 2)}`,
    currentY,
  );
  currentY += 7;
  
  // GST
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...TEXT_PRIMARY);
  doc.text("GST (0%)", summaryX + 5, currentY);
  doc.setTextColor(...TEXT_SECONDARY);
  doc.text("Not Applicable", pageWidth - margin - 5, currentY, {
    align: "right",
  });
  currentY += 6;

  // Divider before total
  doc.setDrawColor(...DIVIDER);
  doc.line(summaryX + 5, currentY, pageWidth - margin - 5, currentY);

  // Grand Total (Highlighted - matching invoice)
  doc.setFillColor(...BRAND_GREEN);
  doc.roundedRect(summaryX, currentY + 4, summaryWidth, 15, 2, 2, "F");
  
  doc.setTextColor(...WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("NET PAYABLE", summaryX + 5, currentY + 13);
  doc.setFontSize(13);
  doc.text(
    `Rs. ${formatNumberWithCommas(totalAmount, 2)}`,
    pageWidth - margin - 5,
    currentY + 13,
    { align: "right" },
  );

  // ========== SIGNATURE & FOOTER SECTION (MATCHING INVOICE STYLE) ==========
  const sigY = finalY + 80;

  if (sigY > pageHeight - 20) {
    doc.addPage();
  }

  // Signature line (matching invoice)
  doc.setDrawColor(...DIVIDER);
  doc.line(pageWidth - margin - 50, sigY, pageWidth - margin, sigY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_PRIMARY);
  doc.text("Authorized Signature", pageWidth - margin - 25, sigY + 6, {
    align: "center",
  });

  // Footer banner
  const footerY = pageHeight - 15;
  doc.setFillColor(...BRAND_GREEN);
  doc.rect(0, footerY, pageWidth, 3, "F");

  doc.setFontSize(7);
  doc.setTextColor(...TEXT_SECONDARY);
  doc.text(
    "Thank you for being a valuable partner!",
    pageWidth / 2,
    footerY + 7,
    { align: "center" }
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
