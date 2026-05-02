import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDateForDisplay } from "./dateUtils";
import { formatNumberWithCommas } from "./formatNumberWithComma";

const kg = ["Butter", "Fresh Cream", "Ghee", "Soft Paneer", "Premium Paneer"];

// PDF Design Constants
const PRIMARY_COLOR = [39, 121, 93]; // Corporate Green
const SECONDARY_BG = [240, 244, 242]; // Light green tint for boxes
const TEXT_DARK = [33, 37, 41];
const TEXT_MUTED = [100, 116, 139];

export const exportInvoiceToPDF = (
  orders,
  customer,
  dateRange,
  fileName,
  isGST,
) => {
  if (!orders?.length) return alert("No orders to export");

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;

  // --- 1. Header Section ---
  const drawHeader = () => {
    // Top Bar
    doc.setFillColor(...PRIMARY_COLOR);
    doc.rect(0, 0, pageWidth, 8, "F");

    // Title & Company Info
    doc.setTextColor(...PRIMARY_COLOR);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("MAGIZH AGRO PRODUCT", margin, 25);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...TEXT_MUTED);
    doc.text("Premium Dairy", margin, 30);

    // Company Details (Right Aligned)
    doc.setTextColor(...TEXT_DARK);
    doc.setFont("helvetica", "bold");
    doc.text("GSTIN: 33AAKCM1234F1ZR", pageWidth - margin, 25, {
      align: "right",
    });
    doc.setFont("helvetica", "normal");
    doc.text("Gudiyatham, Tamil Nadu", pageWidth - margin, 30, {
      align: "right",
    });
    doc.text("Ph: +91 93636 46314", pageWidth - margin, 35, { align: "right" });
  };

  // --- 2. Address Grid (From vs To) ---
  const drawAddressGrid = (startY) => {
    doc.setFillColor(...SECONDARY_BG);
    doc.rect(margin, startY, pageWidth - margin * 2, 35, "F");

    // Bill To
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...PRIMARY_COLOR);
    doc.text("BILL TO:", margin + 5, startY + 8);

    doc.setTextColor(...TEXT_DARK);
    doc.setFontSize(11);
    doc.text(
      customer?.customerName || "Walking Customer",
      margin + 5,
      startY + 15,
    );

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...TEXT_MUTED);
    const address = customer?.address || "No Address Provided";
    const splitAddress = doc.splitTextToSize(address, 80);
    doc.text(splitAddress, margin + 5, startY + 20);
    if (customer?.mobile)
      doc.text(`Contact: ${customer.mobile}`, margin + 5, startY + 31);

    // Invoice Info
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...PRIMARY_COLOR);
    doc.text("INVOICE DETAILS:", pageWidth / 2 + 10, startY + 8);

    doc.setFontSize(9);
    doc.setTextColor(...TEXT_DARK);
    doc.setFont("helvetica", "normal");
   (dateRange.start == dateRange.end)
      ? doc.text(
          `Period: ${dateRange.start}`,
          pageWidth / 2 + 10,
          startY + 15,
        )
      : doc.text(
          `Period: ${dateRange.start} - ${dateRange.end}`,
          pageWidth / 2 + 10,
          startY + 15,
        );
    doc.text(
      `Invoice Date: ${formatDateForDisplay(new Date())}`,
      pageWidth / 2 + 10,
      startY + 20,
    );
    if (customer?.customerGST) {
      doc.setFont("helvetica", "bold");
      doc.text(
        `Cust. GST: ${customer.customerGST}`,
        pageWidth / 2 + 10,
        startY + 26,
      );
    }
  };

  // --- 3. Data Processing ---
  let subTotal = 0;
  const productQuantities = {};
  const tableRows = orders.flatMap((order) => {
    return order.items.map((item, idx) => {
      subTotal += item.totalAmount;
      productQuantities[item.product] =
        (productQuantities[item.product] || 0) + item.quantity;

      return [
        idx === 0 ? formatDateForDisplay(order.date) : ``, // Only show date on first item of order
        item.product,
        `${item.quantity} ${kg.includes(item.product) ? "Kg" : "L"}`,
        `Rs. ${formatNumberWithCommas(item.ratePerUnit, 2)}`,
        `Rs. ${formatNumberWithCommas(item.totalAmount, 2)}`,
      ];
    });
  });

  // --- 4. Render Table ---
  drawHeader();
  drawAddressGrid(45);

  autoTable(doc, {
    startY: 85,
    head: [["Date", "Product", "Qty", "Rate per (Kg/L)", "Total"]],
    body: tableRows,
    theme: "grid",
    headStyles: { fillColor: PRIMARY_COLOR, halign: "center" },
    columnStyles: {
      0: { cellWidth: 30, halign: "left" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 25, halign: "center" },
      3: { cellWidth: 35, halign: "right" },
      4: { cellWidth: 35, halign: "right" },
    },
    styles: { fontSize: 9, cellPadding: 4 },
  });

  // --- 5. Summary & Tax Calculations ---
  let finalY = doc.lastAutoTable.finalY + 10;

  // Tax logic (Assuming 5% GST for dairy if applicable)
  const gstRate = 0.05;
  // const taxAmount = isGST ? subTotal * gstRate : 0;
  // const taxAmount =  subTotal * gstRate;
  const taxAmount =  0;
  const grandTotal = subTotal + taxAmount;

  if (finalY + 70 > doc.internal.pageSize.height) {
    doc.addPage();
    finalY = 20;
  }

  // Left Side: Product Summary
  doc.setFont("helvetica", "bold");
  doc.text("Product Summary:", margin, finalY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  let itemY = finalY + 6;
  Object.entries(productQuantities).forEach(([name, qty]) => {
    doc.text(
      `${name}: ${qty.toFixed(2)} ${kg.includes(name) ? " Kg" : " L"}`,
      margin,
      itemY,
    );
    itemY += 5;
  });

  // Right Side: Totals Box
  const summaryX = pageWidth - 85;
  doc.setFillColor(...SECONDARY_BG);
  doc.rect(summaryX, finalY - 5, 71, 35, "F");

  doc.setFontSize(10);
  doc.setTextColor(...TEXT_DARK);
  doc.text("Sub-total:", summaryX + 5, finalY + 5);
  doc.text(
    ` ${formatNumberWithCommas(subTotal, 2)}`,
    pageWidth - margin - 5,
    finalY + 5,
    { align: "right" },
  );

  doc.text("GST (5%):", summaryX + 5, finalY + 12);
  doc.text(
    // ` ${formatNumberWithCommas(taxAmount, 2)}`,
    ` Not-applicable`,
    pageWidth - margin - 5,
    finalY + 12,
    { align: "right" },
  );

  doc.setFillColor(...PRIMARY_COLOR);
  doc.rect(summaryX, finalY + 18, 71, 10, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.text("GRAND AMOUNT:", summaryX + 5, finalY + 24);
  doc.text(
    `Rs. ${formatNumberWithCommas(grandTotal, 2)}`,
    pageWidth - margin - 5,
    finalY + 24,
    { align: "right" },
  );

  // --- 6. Payment Info & Signatures ---
  doc.setTextColor(...TEXT_MUTED);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("BANK DETAILS:", margin, finalY + 45);
  doc.setFont("helvetica", "normal");
  doc.text("Bank: State Bank of India | A/c: XXXXXXXXXX", margin, finalY + 50);
  doc.text("IFSC: SBIN0001234", margin, finalY + 54);

  // Signatures
  doc.setTextColor(...TEXT_DARK);
  doc.line(pageWidth - 60, finalY + 60, pageWidth - margin, finalY + 60);
  doc.text("Authorized Signatory", pageWidth - 37, finalY + 65, {
    align: "center",
  });

  doc.save(`${fileName || "invoice"}.pdf`);
};
