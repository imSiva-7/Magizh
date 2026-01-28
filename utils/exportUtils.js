import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// --- Utility Functions ---
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

const formatDateForDisplay = (dateStr) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
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

// --- PDF Design Constants ---
const COMPANY_COLOR = [39, 121, 93]; // Corporate Blue
const TEXT_COLOR = [44, 62, 80]; // Dark Grey

export const exportToPDF = (procurements, supplier, dateRange, fileName) => {
  if (!procurements.length) {
    alert("No data to export");
    return;
  }

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginBottom = 20; // Safe margin at bottom

  // --- 1. Header Section ---
  doc.setFillColor(...COMPANY_COLOR);
  doc.rect(0, 0, pageWidth, 40, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("MAGIZH AGRO PRODUCT", 14, 18);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("GUDIYATHAM | GST NO: XXXXXXXXXX", 14, 26);
  doc.text("Phone: +91 93636 46314, +91 75021 36314", 14, 32);

  // Bill Period Box (Top Right)
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(pageWidth - 70, 8, 60, 24, 2, 2, "F");

  doc.setTextColor(...COMPANY_COLOR);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("BILL PERIOD", pageWidth - 65, 14);

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`From: ${dateRange.start}`, pageWidth - 65, 20);
  doc.text(`To:     ${dateRange.end}`, pageWidth - 65, 26);

  // --- 2. Supplier Details Section (Boxed) ---
  const infoStartY = 50;

  doc.setDrawColor(200, 200, 200);
  doc.setFillColor(250, 250, 250);
  doc.roundedRect(14, infoStartY, pageWidth - 28, 25, 2, 2, "FD");

  doc.setTextColor(...TEXT_COLOR);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("SUPPLIER DETAILS", 18, infoStartY + 6);

  // Left side of box
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  if (supplier?.supplierName || supplier) {
    doc.text(
      `Name:   ${supplier.supplierName || supplier}`,
      18,
      infoStartY + 14,
    );
  }
  if (supplier?.bankDetails) {
    doc.text(`Bank:    ${supplier.bankDetails}`, 18, infoStartY + 20);
  }

  // Right side of box
  if (supplier?.supplierTSRate) {
    doc.text(
      `Recent TS Rate: ${formatNumberWithCommas(supplier.supplierTSRate, 2)}`,
      pageWidth / 2 + 10,
      infoStartY + 14,
    );
  }

  // --- 3. Table Section ---
  const headers = [
    [
      "Date",
      "Time",
      // "Qty (Kg)",
      "Qty (Ltr)",
      "FAT %",
      "SNF %",
      "Rate/L",
      "Amount (Rs)",
    ],
  ];

  const headersWithSupplierName = [
    [
      "Date",
      "Time",
      "Supplier Name",
      // "Qty (Kg)",
      "Qty (Ltr)",
      "FAT %",
      "SNF %",
      "TS Rate",
      "Rate/L",
      "Amount (Rs)",
    ],
  ];

  const tableData = [];
  let totalMilkLtr = 0;
  let totalAmount = 0;
  let totalFat = 0;
  let totalSnf = 0;

  // Sorting
  const sortedProcurements = [...procurements].sort((a, b) => {
    const dateCompare = new Date(a.date) - new Date(b.date);
    if (dateCompare !== 0) return dateCompare;
    return (a.time === "AM" ? -1 : 1) - (b.time === "AM" ? -1 : 1);
  });

  sortedProcurements.forEach((record) => {
    const kg = (record.milkQuantity * 1.03).toFixed(2);

    if (supplier?.supplierName) {
      tableData.push([
        formatDateForCSV(record.date),
        record.time || "AM",
        // formatNumberWithCommas(kg, 2),
        formatNumberWithCommas(record.milkQuantity, 2),
        parseFloat(record.fatPercentage).toFixed(1),
        parseFloat(record.snfPercentage).toFixed(1),
        formatNumberWithCommas(record.rate, 2),
        formatNumberWithCommas(record.totalAmount, 2),
      ]);
    } else {
      tableData.push([
        formatDateForCSV(record.date),
        record.time || "AM",
        record.supplierName || "Unknown",
        // formatNumberWithCommas(kg, 2),
        formatNumberWithCommas(record.milkQuantity, 2),
        parseFloat(record.fatPercentage).toFixed(1),
        parseFloat(record.snfPercentage).toFixed(1),
        record.supplierTSRate || "N/A",
        formatNumberWithCommas(record.rate, 2),
        formatNumberWithCommas(record.totalAmount, 2),
      ]);
    }

    totalMilkLtr += record.milkQuantity;
    totalAmount += record.totalAmount;
    totalFat += record.fatPercentage;
    totalSnf += record.snfPercentage;
  });
  //  siva here too
  autoTable(doc, {
    head: supplier?.supplierName ? headers : headersWithSupplierName,
    body: tableData,
    startY: infoStartY + 30,
    theme: "striped",
    margin: { bottom: 20 }, // Ensure autoTable leaves space at bottom
    styles: {
      fontSize: 9,
      cellPadding: 3,
      valign: "middle",
      lineColor: [220, 220, 220],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: COMPANY_COLOR,
      textColor: 255,
      fontStyle: "bold",
      halign: "center",
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
          // 4: { halign: "right" },
          4: { halign: "right" },
          5: { halign: "right" },
          5: { halign: "right" },
          6: { halign: "right" },
          7: { halign: "right", fontStyle: "bold" },
        },
    alternateRowStyles: {
      fillColor: [245, 248, 250],
    },
  });

  // --- 4. Summary & Totals Section ---
  // Calculate final Y position after table
  let finalY = doc.lastAutoTable.finalY + 10;

  // Height needed for summary box (50) + Footer space (roughly 40)
  // If we are too close to the bottom, start a new page
  const requiredSpace = 100;

  if (finalY + requiredSpace > pageHeight) {
    doc.addPage();
    finalY = 20; // Reset Y to top of new page
  }

  // Calculate Averages
  const avgFat = (totalFat / procurements.length).toFixed(2);
  const avgSnf = (totalSnf / procurements.length).toFixed(2);
  const avgRate = totalMilkLtr > 0 ? totalAmount / totalMilkLtr : 0;

  // Draw Summary Box (Right Aligned)
  const summaryWidth = 90;
  const summaryX = pageWidth - summaryWidth - 14;

  // Box Background
  doc.setFillColor(245, 245, 245);
  doc.rect(summaryX, finalY, summaryWidth, 50, "F");
  doc.setDrawColor(200, 200, 200);
  doc.rect(summaryX, finalY, summaryWidth, 50, "S");

  doc.setTextColor(...TEXT_COLOR);
  doc.setFontSize(10);

  // Helper to draw summary row
  const drawSummaryRow = (label, value, y, isBold = false) => {
    doc.setFont("helvetica", isBold ? "bold" : "normal");
    doc.text(label, summaryX + 5, y);
    doc.text(value, pageWidth - 19, y, { align: "right" });
  };

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("PAYMENT SUMMARY", summaryX + 5, finalY + 8);
  doc.setDrawColor(...COMPANY_COLOR);
  doc.line(summaryX + 5, finalY + 10, pageWidth - 19, finalY + 10);

  doc.setFontSize(10);
  drawSummaryRow(
    "Total Milk:",
    `${formatNumberWithCommas(totalMilkLtr, 2)} Ltr`,
    finalY + 18,
  );
  drawSummaryRow("Avg FAT:", `${avgFat} %`, finalY + 24);
  drawSummaryRow("Avg SNF:", `${avgSnf} %`, finalY + 30);
  drawSummaryRow(
    "Avg Rate:",
    `Rs. ${formatNumberWithCommas(avgRate, 2)}`,
    finalY + 36,
  );

  // Grand Total Highlight
  doc.setFillColor(...COMPANY_COLOR);
  doc.rect(summaryX, finalY + 41, summaryWidth, 9, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("NET PAYABLE", summaryX + 5, finalY + 47);
  doc.text(
    `Rs. ${formatNumberWithCommas(totalAmount, 2)}`,
    pageWidth - 19,
    finalY + 47,
    { align: "right" },
  );

  // --- 5. Footer Section ---
  const footerY = finalY + 65; // Position below summary

  // Double check if footer fits (in case summary fits but footer doesn't)
  if (footerY > pageHeight - 15) {
    doc.addPage();
    // If we added a page for footer, we need to reset Y variables
    // But usually, the check in step 4 handles this.
  }

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");

  // Signature Lines
  const sigY = footerY;
  doc.setDrawColor(100, 100, 100);

  // Prepared By
  doc.line(20, sigY, 70, sigY);
  doc.text("Prepared By", 45, sigY + 5, { align: "center" });

  // Verified By
  doc.line(pageWidth / 2 - 25, sigY, pageWidth / 2 + 25, sigY);
  doc.text("Verified By", pageWidth / 2, sigY + 5, { align: "center" });

  // Receiver
  doc.line(pageWidth - 70, sigY, pageWidth - 20, sigY);
  doc.text("Receiver Signature", pageWidth - 45, sigY + 5, { align: "center" });

  // Timestamp footer
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(
    `Generated on: ${new Date().toLocaleString("en-IN")}`,
    pageWidth / 2,
    pageHeight - 5,
    { align: "center" },
  );

  doc.save(`${fileName || "procurement_bill"}.pdf`);
};

// Original CSV Export (Preserved as is)
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
    "Quantity (Kg)",
    "Quantity (Ltr)",
    "FAT %",
    "SNF %",
    "Rate/L (Rs)",
    "Net Amount (Rs)",
  ];
  const csvRows = [];
  csvRows.push(`"${supplier?.supplierName || "MAGIZH DAIRY PRIVATE LIMITED"}"`);
  csvRows.push(`"GUDIYATHAM"`);
  csvRows.push(
    `"Phone: ${supplier?.supplierNumber || "Mobile: +91 75021 36314"}"`,
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
    const kg = (record.milkQuantity * 1.03).toFixed(2);
    const row = [
      formatDateForCSV(record.date),
      record.time || "AM",
      kg,
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
  csvRows.push(`Total Milk (Ltr),${totalMilkLtr.toFixed(2)}`);
  csvRows.push(`Total Amount,Rs ${totalAmount.toFixed(2)}`);
  csvRows.push(`Average FAT,${(totalFat / procurements.length).toFixed(2)}%`);
  csvRows.push(`Average SNF,${(totalSnf / procurements.length).toFixed(2)}%`);
  csvRows.push(`Average Rate/L,Rs ${(totalAmount / totalMilkLtr).toFixed(2)}`);
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
