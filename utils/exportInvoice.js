import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDateForDisplay } from "./dateUtils";
import { formatNumberWithCommas } from "./formatNumberWithComma";
import QRCode from "qrcode"; // <-- new import for QR generation

const kg = ["Butter", "Fresh Cream", "Soft Paneer", "Premium Paneer"];

// PDF Design Constants
const PRIMARY_COLOR = [39, 121, 93];
const SECONDARY_BG = [240, 244, 242];
const TEXT_DARK = [33, 37, 41];
const TEXT_MUTED = [100, 116, 139];

// Helper to build the UPI intent URL with pre‑filled amount
const buildUPILink = (amount) => {
  const upiID = "magizhagro@upi";           // replace with your actual UPI ID
  const payeeName = "MAGIZH AGRO PRODUCT";
  const currency = "INR";
  const amt = Number(amount).toFixed(2);    // remove commas, 2 decimals
  return `upi://pay?pa=${upiID}&pn=${encodeURIComponent(payeeName)}&am=${amt}&cu=${currency}`;
};

export const exportInvoiceToPDF = async (   // <-- now async
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

  const drawHeader = () => {
    doc.setFillColor(...PRIMARY_COLOR);
    doc.rect(0, 0, pageWidth, 8, "F");

    doc.setTextColor(...PRIMARY_COLOR);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("MAGIZH AGRO PRODUCT", margin, 25);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...TEXT_MUTED);
    doc.text("Your Premium Dairy Partner", margin, 30);

    doc.setTextColor(...TEXT_DARK);
    doc.setFont("helvetica", "bold");
    doc.text("GSTIN: 33ACBFM9128J1Z4", pageWidth - margin, 25, {
      align: "right",
    });
    doc.setFont("helvetica", "normal");
    doc.text("Gudiyatham, Tamil Nadu", pageWidth - margin, 30, {
      align: "right",
    });
    doc.text("Ph: +91 93636 46314", pageWidth - margin, 35, { align: "right" });
  };

  const drawAddressGrid = (startY) => {
    doc.setFillColor(...SECONDARY_BG);
    doc.rect(margin, startY, pageWidth - margin * 2, 35, "F");

    doc.setFont("helvetica", "bold");
    doc.setTextColor(...PRIMARY_COLOR);
    doc.text("BILL TO:", margin + 5, startY + 8);

    doc.setTextColor(...TEXT_DARK);
    doc.setFontSize(11);
    doc.text(
      customer?.customerName || "All Customers",
      margin + 5,
      startY + 15,
    );

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...TEXT_MUTED);
    const address = customer?.customerName
      ? customer?.address || "No Address Provided"
      : "";
    const splitAddress = doc.splitTextToSize(address, 80);
    doc.text(splitAddress, margin + 5, startY + 20);
    if (customer?.mobile)
      doc.text(`Contact: ${customer.mobile}`, margin + 5, startY + 31);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(...PRIMARY_COLOR);
    doc.text("INVOICE DETAILS:", pageWidth / 2 + 10, startY + 8);

    doc.setFontSize(9);
    doc.setTextColor(...TEXT_DARK);
    doc.setFont("helvetica", "normal");
    dateRange.start == dateRange.end
      ? doc.text(`Period: ${dateRange.start}`, pageWidth / 2 + 10, startY + 15)
      : doc.text(
          `Period: ${dateRange.start} - ${dateRange.end}`,
          pageWidth / 2 + 10,
          startY + 15,
        );
    // doc.text(
    //   `Invoice Date: ${formatDateForDisplay(new Date())}`,
    //   pageWidth / 2 + 10,
    //   startY + 20,
    // );
    if (customer?.customerGST) {
      doc.setFont("helvetica", "bold");
      doc.text(
        `Cust. GST: ${customer.customerGST}`,
        pageWidth / 2 + 10,
        startY + 26,
      );
    }
  };

  let subTotal = 0;
  const productQuantities = {};
  const tableRows = orders.flatMap((order) => {
    return order.items.map((item, idx) => {
      subTotal += item.totalAmount;
      productQuantities[item.product] =
        (productQuantities[item.product] || 0) + item.quantity;

      if (customer?.customerName) {
        return [
          idx === 0 ? formatDateForDisplay(order.date) : ``,
          item.product,
          `${item.quantity} ${kg.includes(item.product) ? "Kg" : "L"}`,
          `Rs. ${formatNumberWithCommas(item.ratePerUnit, 2)}`,
          `Rs. ${formatNumberWithCommas(item.totalAmount, 2)}`,
        ];
      } else {
        return [
          idx === 0 ? formatDateForDisplay(order.date) : ``,
          idx === 0 ? `(${idx + 1}) ${order.customerName}` : `(${idx + 1})`,
          item.product,
          `${item.quantity} ${kg.includes(item.product) ? "Kg" : "L"}`,
          `Rs. ${formatNumberWithCommas(item.ratePerUnit, 2)}`,
          `Rs. ${formatNumberWithCommas(item.totalAmount, 2)}`,
        ];
      }
    });
  });

  drawHeader();
  drawAddressGrid(45);

  if (customer?.customerName) {
    autoTable(doc, {
      startY: 85,
      head: [["Date", "Product", "Qty (Kg/L)", "Rate per (Kg/L)", "Total"]],
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
  } else {
    autoTable(doc, {
      startY: 85,
      head: [
        ["Date", "Customer", "Product", "Qty ", "Rate per (Kg/L)", "Total"],
      ],
      body: tableRows,
      theme: "grid",
      headStyles: { fillColor: PRIMARY_COLOR, halign: "center" },
      columnStyles: {
        0: { cellWidth: 30, halign: "left" },
        1: { cellWidth: "auto" },
        2: { cellWidth: "auto" },
        3: { cellWidth: 20, halign: "right" },
        4: { cellWidth: 35, halign: "right" },
        5: { cellWidth: 30, halign: "right" },
      },
      styles: { fontSize: 9, cellPadding: 4 },
    });
  }

  let finalY = doc.lastAutoTable.finalY + 10;

  // Tax logic (Assuming 5% GST for dairy if applicable)

  // const gstRate = 0.05;
  // const taxAmount = isGST ? subTotal * gstRate : 0;
  // const taxAmount =  subTotal * gstRate;

  const taxAmount = 0;
  const grandTotal = subTotal + taxAmount;

  if (finalY + 70 > doc.internal.pageSize.height) {
    doc.addPage();
    finalY = 20;
  }

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
  doc.rect(summaryX, finalY + 20, 71, 10, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.text("GRAND AMOUNT:", summaryX + 5, finalY + 26);
  doc.text(
    `Rs. ${formatNumberWithCommas(grandTotal, 2)}`,
    pageWidth - margin - 5,
    finalY + 26,
    { align: "right" },
  );

    // ========== UPI / GPay Payment Section ==========
  const upiLink = buildUPILink(grandTotal);
  const paymentY = finalY + 45;   // start below the grand total block

  // Clickable link text
  doc.setTextColor(...PRIMARY_COLOR);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  const linkText = "Pay via UPI / GPay";
  const linkX = margin;
  doc.textWithLink(linkText, linkX, paymentY, {
    url: upiLink,
  });

  // Generate and embed the QR code (async)
  const qrDataUrl = await QRCode.toDataURL(upiLink, { width: 200 });

  // Place QR code below the link text, on the left side
  const qrSize = 30; // mm
  const qrX = margin;                     // left‑aligned with the link text
  const qrY = paymentY + 8;               // 8mm below the link text
  doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);

  // Label under the QR code
  doc.setFontSize(7);
  doc.setTextColor(...TEXT_MUTED);
  doc.text("Scan to pay", qrX + qrSize / 2, qrY + qrSize + 3, {
    align: "center",
  });

  // The previous commented‑out GPay details block is replaced by the code above
  // if (customer?.customerName) {
  //   doc.setTextColor(...TEXT_MUTED);
  //   doc.setFontSize(8);
  //   doc.setFont("helvetica", "bold");
  //   doc.text("GPAY DETAILS:", margin, finalY + 45);
  //   doc.setFont("helvetica", "normal");
  //   doc.text("Bank: State Bank of India | : XXXXXXXXXX", margin, finalY + 50);
  //   doc.text("IFSC: SBIN0001234", margin, finalY + 54);
  // }

  doc.setTextColor(...TEXT_DARK);
  doc.line(pageWidth - 60, finalY + 60, pageWidth - margin, finalY + 60);
  doc.text("Authorized Signatory", pageWidth - 37, finalY + 69, {
    align: "center",
  });

  doc.save(`${fileName || "invoice"}.pdf`);
};