import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDateForDisplay } from "./dateUtils";
import { formatNumberWithCommas } from "./formatNumberWithComma";
import QRCode from "qrcode";

const kg = ["Butter", "Fresh Cream", "Soft Paneer", "Premium Paneer"];

// Brand Colors - Minimal & Professional
const BRAND_GREEN = [39, 121, 93];        // Primary brand color
const BRAND_LIGHT = [234, 245, 241];      // Light green background
const ACCENT_GOLD = [251, 188, 4];        // Gold accent for highlights
const TEXT_PRIMARY = [30, 41, 59];        // Dark slate
const TEXT_SECONDARY = [100, 116, 139];   // Muted gray
const DIVIDER = [226, 232, 240];          // Light divider
const WHITE = [255, 255, 255];

// Helper to build the UPI intent URL
const buildUPILink = (amount) => {
  const upiID = "magizhagro@upi";
  const payeeName = "MAGIZH AGRO PRODUCT";
  const currency = "INR";
  const amt = Number(amount).toFixed(2);
  return `upi://pay?pa=${upiID}&pn=${encodeURIComponent(payeeName)}&am=${amt}&cu=${currency}`;
};

export const exportInvoiceToPDF = async (
  orders,
  customer,
  dateRange,
  fileName,
  isGST,
) => {
  if (!orders?.length) return alert("No orders to export");

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;

  // ========== HEADER SECTION (Minimal & Modern) ==========
  const drawHeader = () => {
    // Top accent bar
    doc.setFillColor(...BRAND_GREEN);
    doc.rect(0, 0, pageWidth, 3, "F");

    // Company name with modern typography
    doc.setTextColor(...BRAND_GREEN);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(26);
    doc.text("MAGIZH AGRO PRODUCT", margin, 18);
    
   
    // Tagline with elegant style
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_SECONDARY);
    doc.text("Premium Dairy Excellence", margin, 30);

    // Company details on the right (minimal)
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_PRIMARY);
    doc.setFont("helvetica", "normal");
    doc.text("GSTIN: 33ACBFM9128J1Z4", pageWidth - margin, 15, { align: "right" });
    doc.text("Gudiyatham, Tamil Nadu", pageWidth - margin, 20, { align: "right" });
    doc.text("+91 93636 46314", pageWidth - margin, 25, { align: "right" });

    // Share icon with WhatsApp functionality (top right corner)
    doc.setFillColor(...BRAND_GREEN);
    doc.circle(pageWidth - margin - 3, 33, 2.5, "F");
    doc.setTextColor(...WHITE);
    doc.setFontSize(10);
    doc.text("⤴", pageWidth - margin - 3.8, 34.5);
    
    // Add WhatsApp share link annotation
    const whatsappMessage = `Invoice for ${customer?.customerName || "Customer"} - Period: ${dateRange.start === dateRange.end ? dateRange.start : `${dateRange.start} to ${dateRange.end}`} - Total: Rs. ${formatNumberWithCommas(grandTotal, 2)}`;
    doc.link(pageWidth - margin - 6, 30.5, 5, 5, { 
      url: `https://wa.me/?text=${encodeURIComponent(whatsappMessage)}` 
    });

    // Invoice title banner
    doc.setFillColor(...BRAND_LIGHT);
    doc.roundedRect(margin, 38, pageWidth - margin * 2, 12, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...BRAND_GREEN);
    doc.text("INVOICE", pageWidth / 2, 46, { align: "center" });
  };

  // ========== BILL TO & INVOICE DETAILS (Clean Grid) ==========
  const drawDetailsGrid = (startY) => {
    const boxHeight = 38;
    const boxWidth = (pageWidth - margin * 3) / 2;

    // Left box - Bill To
    doc.setDrawColor(...DIVIDER);
    doc.setLineWidth(0.5);
    doc.roundedRect(margin, startY, boxWidth, boxHeight, 3, 3);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...BRAND_GREEN);
    doc.text("BILL TO", margin + 5, startY + 8);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...TEXT_PRIMARY);
    doc.text(
      customer?.customerName || "All Customers",
      margin + 5,
      startY + 16
    );

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_SECONDARY);
    const address = customer?.customerName
      ? customer?.address || "No Address Provided"
      : "";
    const splitAddress = doc.splitTextToSize(address, boxWidth - 10);
    doc.text(splitAddress, margin + 5, startY + 22);
    
    // Customer GST on left side (below address, above phone)
    let nextY = startY + 22 + (splitAddress.length * 4);
    if (customer?.customerGST) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...TEXT_SECONDARY);
      doc.text("GST:", margin + 5, nextY + 3);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...TEXT_PRIMARY);
      doc.text(customer.customerGST, margin + 15, nextY + 3);
      nextY += 5;
    }
    
    if (customer?.mobile) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...TEXT_SECONDARY);
      doc.text(`📞 ${customer.mobile}`, margin + 5, nextY + 3);
    }

    // Right box - Invoice Details
    const rightBoxX = margin * 2 + boxWidth;
    doc.roundedRect(rightBoxX, startY, boxWidth, boxHeight, 3, 3);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...BRAND_GREEN);
    doc.text("INVOICE DETAILS", rightBoxX + 5, startY + 8);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_PRIMARY);
    
    doc.text("Invoice Date:", rightBoxX + 5, startY + 16);
    doc.setFont("helvetica", "bold");
    doc.text(formatDateForDisplay(new Date()), rightBoxX + 35, startY + 16);

    doc.setFont("helvetica", "normal");
    doc.text("Period:", rightBoxX + 5, startY + 22);
    doc.setFont("helvetica", "bold");
    const periodText = dateRange.start === dateRange.end 
      ? dateRange.start 
      : `${dateRange.start} - ${dateRange.end}`;
    const splitPeriod = doc.splitTextToSize(periodText, boxWidth - 40);
    doc.text(splitPeriod, rightBoxX + 35, startY + 22);

   
  };

  // ========== CALCULATE TOTALS ==========
  let subTotal = 0;
  const productQuantities = {};
  const tableRows = orders.flatMap((order) => {
    return order.items.map((item, idx) => {
      subTotal += item.totalAmount;
      productQuantities[item.product] =
        (productQuantities[item.product] || 0) + item.quantity;

      if (customer?.customerName) {
        return [
          idx === 0 ? formatDateForDisplay(order.date) : "",
          item.product,
          `${item.quantity} ${kg.includes(item.product) ? "Kg" : "L"}`,
          `Rs. ${formatNumberWithCommas(item.ratePerUnit, 2)}`,
          `Rs. ${formatNumberWithCommas(item.totalAmount, 2)}`,
        ];
      } else {
        return [
          idx === 0 ? formatDateForDisplay(order.date) : "",
          idx === 0 ? order.customerName : "",
          item.product,
          `${item.quantity} ${kg.includes(item.product) ? "Kg" : "L"}`,
          `Rs. ${formatNumberWithCommas(item.ratePerUnit, 2)}`,
          `Rs. ${formatNumberWithCommas(item.totalAmount, 2)}`,
        ];
      }
    });
  });

  const taxAmount = 0;
  const grandTotal = subTotal + taxAmount;

  // ========== RENDER DOCUMENT ==========
  drawHeader();
  drawDetailsGrid(56);

  // ========== ITEMS TABLE (Modern Design) ==========
  const tableStartY = 100;
  
  if (customer?.customerName) {
    autoTable(doc, {
      startY: tableStartY,
      head: [["Date", "Product", "Quantity", "Rate", "Amount"]],
      body: tableRows,
      theme: "plain",
      headStyles: {
        fillColor: BRAND_GREEN,
        textColor: WHITE,
        fontSize: 10,
        fontStyle: "bold",
        halign: "center",
        cellPadding: { top: 4, bottom: 4, left: 3, right: 3 },
      },
      bodyStyles: {
        fontSize: 9,
        textColor: TEXT_PRIMARY,
        cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { cellWidth: 32, halign: "left" },
        1: { cellWidth: "auto", halign: "left" },
        2: { cellWidth: 28, halign: "center" },
        3: { cellWidth: 32, halign: "right" },
        4: { cellWidth: 36, halign: "right", fontStyle: "bold" },
      },
      styles: {
        lineColor: DIVIDER,
        lineWidth: 0.3,
      },
    });
  } else {
    autoTable(doc, {
      startY: tableStartY,
      head: [["Date", "Customer", "Product", "Qty", "Rate", "Amount"]],
      body: tableRows,
      theme: "plain",
      headStyles: {
        fillColor: BRAND_GREEN,
        textColor: WHITE,
        fontSize: 10,
        fontStyle: "bold",
        halign: "center",
        cellPadding: { top: 4, bottom: 4, left: 3, right: 3 },
      },
      bodyStyles: {
        fontSize: 9,
        textColor: TEXT_PRIMARY,
        cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { cellWidth: 28, halign: "left" },
        1: { cellWidth: "auto", halign: "left" },
        2: { cellWidth: "auto", halign: "left" },
        3: { cellWidth: 22, halign: "center" },
        4: { cellWidth: 28, halign: "right" },
        5: { cellWidth: 32, halign: "right", fontStyle: "bold" },
      },
      styles: {
        lineColor: DIVIDER,
        lineWidth: 0.3,
      },
    });
  }

  let finalY = doc.lastAutoTable.finalY + 10;

  // Check if we need a new page
  if (finalY + 80 > pageHeight) {
    doc.addPage();
    finalY = 20;
  }

  // ========== PRODUCT SUMMARY & TOTAL SECTION (Side by Side) ==========
  const summaryWidth = 80;
  const summaryX = pageWidth - margin - summaryWidth;

  // Product Summary on the left
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...BRAND_GREEN);
  doc.text("PRODUCT SUMMARY", margin, finalY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_PRIMARY);
  let itemY = finalY + 7;
  Object.entries(productQuantities).forEach(([name, qty]) => {
    doc.setTextColor(...TEXT_SECONDARY);
    doc.text("•", margin, itemY);
    doc.setTextColor(...TEXT_PRIMARY);
    doc.text(
      `${name}: ${qty.toFixed(2)} ${kg.includes(name) ? "Kg" : "L"}`,
      margin + 4,
      itemY
    );
    itemY += 5;
  });

  // Total Summary on the right (Minimal Card Design)
  doc.setDrawColor(...DIVIDER);
  doc.setLineWidth(0.5);
  doc.roundedRect(summaryX, finalY - 5, summaryWidth, 42, 3, 3);

  // Sub-total
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...TEXT_PRIMARY);
  doc.text("Subtotal", summaryX + 5, finalY + 5);
  doc.text(
    `Rs. ${formatNumberWithCommas(subTotal, 2)}`,
    pageWidth - margin - 5,
    finalY + 5,
    { align: "right" }
  );

  // GST
  doc.text("GST (5%)", summaryX + 5, finalY + 13);
  doc.setTextColor(...TEXT_SECONDARY);
  doc.text("Not Applicable", pageWidth - margin - 5, finalY + 13, {
    align: "right",
  });

  // Divider
  doc.setDrawColor(...DIVIDER);
  doc.line(summaryX + 5, finalY + 18, pageWidth - margin - 5, finalY + 18);

  // Grand Total (Highlighted)
  doc.setFillColor(...BRAND_GREEN);
  doc.roundedRect(summaryX, finalY + 22, summaryWidth, 15, 2, 2, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...WHITE);
  doc.text("TOTAL AMOUNT", summaryX + 5, finalY + 31);
  doc.setFontSize(13);
  doc.text(
    `Rs. ${formatNumberWithCommas(grandTotal, 2)}`,
    pageWidth - margin - 5,
    finalY + 31,
    { align: "right" }
  );

  // ========== PAYMENT SECTION (UPI/QR) ==========
  const paymentY = finalY + 50;

  // Payment box
  doc.setFillColor(...BRAND_LIGHT);
  doc.roundedRect(margin, paymentY, 70, 40, 3, 3, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...BRAND_GREEN);
  doc.text("PAYMENT OPTIONS", margin + 5, paymentY + 7);

  // UPI Link - Fixed to be clickable
  const upiLink = buildUPILink(grandTotal);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BRAND_GREEN);
  doc.text("Pay via UPI / GPay", margin + 5, paymentY + 14);
  
  // Create clickable link area over the text
  const linkWidth = 45;
  const linkHeight = 5;
  doc.link(margin + 5, paymentY + 9.5, linkWidth, linkHeight, { url: upiLink });
  
  // Add underline to show it's clickable
  // doc.setDrawColor(...BRAND_GREEN);
  // doc.setLineWidth(0.3);
  // doc.line(margin + 5, paymentY + 15, margin + linkWidth, paymentY + 15);

  // QR Code
  const qrDataUrl = await QRCode.toDataURL(upiLink, { width: 200 });
  const qrSize = 25;
  doc.addImage(qrDataUrl, "PNG", margin + 41, paymentY + 5, qrSize, qrSize);

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...TEXT_SECONDARY);
  doc.text("Scan to Pay", margin + 53.5, paymentY + 33, { align: "center" });

  // Bank details (minimal)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_SECONDARY);
  doc.text("UPI ID: magizhagro@upi", margin + 5, paymentY + 25);

  // ========== SIGNATURE SECTION ==========
  const sigY = paymentY + 45;
  doc.setDrawColor(...DIVIDER);
  doc.line(pageWidth - margin - 50, sigY, pageWidth - margin, sigY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_PRIMARY);
  doc.text("Authorized Signature", pageWidth - margin - 25, sigY + 6, {
    align: "center",
  });

  // ========== FOOTER ==========
  const footerY = pageHeight - 15;
  doc.setFillColor(...BRAND_GREEN);
  doc.rect(0, footerY, pageWidth, 3, "F");

  doc.setFontSize(7);
  doc.setTextColor(...TEXT_SECONDARY);
  doc.text(
    "Thank you for your business! | This is a computer-generated invoice.",
    pageWidth / 2,
    footerY + 7,
    { align: "center" }
  );

  // Save PDF
  doc.save(`${fileName || "invoice"}.pdf`);
};
