import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const formatNumberWithCommas = (value, decimals = 2) => {
  const num = Number(value);

  if (!Number.isFinite(num)) {
    return (0).toFixed(decimals);
  }

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

const calculateFatKg = (liters, fatPercent) => {
  return ((liters * fatPercent) / 100).toFixed(3);
};

const calculateSnfKg = (liters, snfPercent) => {C
  return ((liters * snfPercent) / 100).toFixed(3);
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
    { totalMilk: 0, totalAmount: 0, totalFat: 0, totalSnf: 0 }
  );

  return {
    totalMilk: totals.totalMilk,
    totalAmount: totals.totalAmount,
    avgFat: totals.totalFat / procurements.length,
    avgSnf: totals.totalSnf / procurements.length,
    avgRate: totals.totalMilk > 0 ? totals.totalAmount / totals.totalMilk : 0,
  };
};

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
    "Rate/L (₹)",
    "Net Amount (₹)",
  ];

  const csvRows = [];

  csvRows.push(`"${supplier?.supplierName || "MAGIZH DAIRY PRIVATE LIMITED"}"`);

  csvRows.push(`"GUDIYATHAM"`);
  csvRows.push(
    `"Phone: ${supplier?.supplierNumber || "Mobile: +91 75021 36314"}"`
  );

  csvRows.push(
    `"MILK BILL Date: ${formatDateForCSV(
      dateRange.start
    )} to ${formatDateForCSV(dateRange.end)}"`
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
      record.rate.toFixed(2),
      record.totalAmount.toFixed(2),
    ];
    csvRows.push(row.join(","));

    totalMilkLtr += record.milkQuantity;
    totalAmount += record.totalAmount;
    totalFat += record.fatPercentage;
    totalSnf += record.snfPercentage;
  });

  // Add summary
  csvRows.push("");
  csvRows.push("SUMMARY");
  csvRows.push(`Total Milk (Ltr),${totalMilkLtr.toFixed(2)}`);
  csvRows.push(`Total Amount,₹${totalAmount.toFixed(2)}`);
  csvRows.push(`Average FAT,${(totalFat / procurements.length).toFixed(2)}%`);
  csvRows.push(`Average SNF,${(totalSnf / procurements.length).toFixed(2)}%`);
  csvRows.push(`Average Rate/L,₹${(totalAmount / totalMilkLtr).toFixed(2)}`);

  // Convert to CSV string
  const csvContent = csvRows.join("\n");

  // Create download link
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
// Now update your exportToPDF function:

export const exportToPDF = (procurements, supplier, dateRange, fileName) => {
  if (!procurements.length) {
    alert("No data to export");
    return;
  }

  const doc = new jsPDF();

  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("MAGIZH DAIRY PRIVATE LIMITED", pageWidth / 2, 10, {
    align: "center",
  });

  doc.setFontSize(12);
  doc.text("GUDIYATHAM", pageWidth / 2, 16, { align: "center" });

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Phone:  +91 75021 36314", pageWidth / 2, 22, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.text(
    `MILK BILL Date: ${formatDateForDisplay(
      dateRange.start
    )} to ${formatDateForDisplay(dateRange.end)}`,
    pageWidth / 2,
    28,
    { align: "center" }
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  if (supplier?.supplierName) {
    doc.text(`Supplier Name: ${supplier.supplierName}`, 14, 36);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  if (supplier?.supplierTSRate) {
    doc.text(
      `Recent Total Solid Rate: ${formatNumberWithCommas(
        supplier.supplierTSRate,
        2
      )}`,
      14,
      42
    );
  }

  if (supplier?.bankDetails) {
    doc.text(`Bank: ${supplier.bankDetails}`, 14, 48);
  }

  const headers = [
    [
      "Date",
      "AM/PM",
      "Qty (Kg)",
      "Qty (Ltr)",
      "FAT %",
      "SNF %",
      "Rate/L",
      "Amount ",
    ],
  ];

  // Prepare table data
  const tableData = [];

  // Sort procurements by date and time
  const sortedProcurements = [...procurements].sort((a, b) => {
    const dateCompare = new Date(a.date) - new Date(b.date);
    if (dateCompare !== 0) return dateCompare;
    return (a.time === "AM" ? -1 : 1) - (b.time === "AM" ? -1 : 1);
  });

  // Add rows to table
  let totalMilkLtr = 0;
  let totalAmount = 0;
  let totalFat = 0;
  let totalSnf = 0;

  sortedProcurements.forEach((record) => {
    const kg = (record.milkQuantity * 1.03).toFixed(2);

    // Format values with commas
    const formattedRate = formatNumberWithCommas(record.rate, 2);
    const formattedAmount = formatNumberWithCommas(record.totalAmount, 2);
    const formattedMilkQuantity = formatNumberWithCommas(
      record.milkQuantity,
      2
    );
    const formattedKg = formatNumberWithCommas(kg, 2);

    tableData.push([
      formatDateForCSV(record.date),
      record.time || "AM",
      formattedKg,
      formattedMilkQuantity,
      parseFloat(record.fatPercentage).toFixed(2),
      parseFloat(record.snfPercentage).toFixed(2),
      formattedRate,
      formattedAmount,
    ]);

    totalMilkLtr += record.milkQuantity;
    totalAmount += record.totalAmount;
    totalFat += record.fatPercentage;
    totalSnf += record.snfPercentage;
  });

  // Generate table using autoTable directly
  autoTable(doc, {
    head: headers,
    body: tableData,
    startY: 50,
    theme: "grid",
    styles: {
      fontSize: 8,
      cellPadding: 2,
    },
    headStyles: {
      fillColor: [41, 128, 185],
      textColor: 255,
      fontStyle: "bold",
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245],
    },
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: 15 },
      2: { cellWidth: 15 },
      3: { cellWidth: 15 },
      4: { cellWidth: 14 },
      5: { cellWidth: 14 },
      6: { cellWidth: 18 },
      7: { cellWidth: 28 },
    },
  });

  // Add summary section
  const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 10 : 120;

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");

  // Format summary values with commas
  const formattedTotalMilk = formatNumberWithCommas(totalMilkLtr, 1);
  const formattedTotalAmount = formatNumberWithCommas(totalAmount, 1);
  const avgRate = totalMilkLtr > 0 ? totalAmount / totalMilkLtr : 0;
  const formattedAvgRate = formatNumberWithCommas(avgRate, 1);

  // Summary table with comma formatting
  const summaryData = [
    ["Total Milk (Ltr):", `${formattedTotalMilk} L`],
    ["Total Amount:", `${formattedTotalAmount}`],
    ["Average FAT:", `${(totalFat / procurements.length).toFixed(2)}%`],
    ["Average SNF:", `${(totalSnf / procurements.length).toFixed(2)}%`],
    ["Average Rate/L:", `${formattedAvgRate}`],
  ];

  // Create summary table
  autoTable(doc, {
    body: summaryData,
    startY: finalY,
    theme: "plain",
    styles: {
      fontSize: 10,
      cellPadding: 3,
    },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 60 },
      1: { fontStyle: "normal", cellWidth: 50 },
    },
  });

  // Footer
  const lastAutoTableY = doc.lastAutoTable
    ? doc.lastAutoTable.finalY
    : finalY + 40;
  const footerY = lastAutoTableY + 20;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Prepared by:", 20, footerY);
  doc.text("Verified by:", pageWidth / 2, footerY, { align: "center" });
  doc.text("Received Signature:", pageWidth - 20, footerY, { align: "right" });

  // Save PDF
  doc.save(`${fileName || "procurement"}.pdf`);
};

export { calculateTotals };
