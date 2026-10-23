import { attendanceToday, formatAttendanceDate, formatAttendanceMonth } from "./attendanceDates.mjs";
import { jsPDF } from "jspdf";
import { attendanceFilename } from "./attendanceFilename";
import autoTable from "jspdf-autotable";
import { formatNumberWithCommas } from "./formatNumberWithComma.js";

// Brand Colors - Clean, Modern & Professional
const BRAND_GREEN = [39, 121, 93];
const BRAND_LIGHT = [234, 245, 241];
const CARD_BG = [248, 250, 252];
const TEXT_PRIMARY = [30, 41, 59];
const TEXT_SECONDARY = [100, 116, 139];
const DIVIDER = [226, 232, 240];
const WHITE = [255, 255, 255];
const ACCENT_RED = [220, 38, 38];
const ACCENT_RED_LIGHT = [254, 242, 242];
const ACCENT_GREEN = [22, 101, 52];
const ACCENT_GREEN_LIGHT = [220, 252, 231];

const formatCurrency = (amount) => {
  return `Rs. ${formatNumberWithCommas(amount || 0, 2)}`;
};

const formatTime = (status, time) => {
  if (status !== "Present" || !time) return "-";
  try {
    const [hours, minutes] = time.split(":");
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  } catch {
    return time;
  }
};

export const exportAttendanceToPDF = (attendanceData, month, fileName, returnBytes = false) => {
  if (!attendanceData) {
    alert("No attendance data to export");
    return;
  }

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;

  // ========== HEADER SECTION ==========
  const drawHeader = () => {
    // Top primary brand accent line
    doc.setFillColor(...BRAND_GREEN);
    doc.rect(0, 0, pageWidth, 4, "F");

    // Company Title
    doc.setTextColor(...BRAND_GREEN);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("MAGIZH AGRO PRODUCT", margin, 18);

    // Tagline / subtitle
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_SECONDARY);
    doc.setFont("helvetica", "normal");
    doc.text("Employee Attendance & Salary Statement", margin, 24);

    // Company contact details on the right
    doc.setFontSize(8.5);
    doc.setTextColor(...TEXT_PRIMARY);
    doc.setFont("helvetica", "normal");
    doc.text("GSTIN: 33ACBFM9128J1Z4", pageWidth - margin, 15, { align: "right" });
    doc.text("Gudiyatham, Tamil Nadu", pageWidth - margin, 20, { align: "right" });
    doc.text("+91 93636 46314", pageWidth - margin, 25, { align: "right" });

    // Report Banner
    doc.setFillColor(...BRAND_LIGHT);
    doc.roundedRect(margin, 34, contentWidth, 11, 3, 3, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...BRAND_GREEN);
    doc.text("ATTENDANCE & SALARY REPORT", pageWidth / 2, 41.5, { align: "center" });
  };

  // ========== EMPLOYEE & PERIOD DETAILS (Clean Cards) ==========
  const drawDetailsGrid = (startY) => {
    const boxHeight = 36;
    const boxWidth = (contentWidth - margin) / 2;

    // Left Card - Employee Information
    doc.setFillColor(...CARD_BG);
    doc.roundedRect(margin, startY, boxWidth, boxHeight, 3.5, 3.5, "F");
    doc.setDrawColor(...DIVIDER);
    doc.setLineWidth(0.5);
    doc.roundedRect(margin, startY, boxWidth, boxHeight, 3.5, 3.5, "S");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...BRAND_GREEN);
    doc.text("EMPLOYEE INFORMATION", margin + 6, startY + 8);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...TEXT_PRIMARY);
    doc.text(attendanceData.employee?.name || "-", margin + 6, startY + 16);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_SECONDARY);
    doc.text(`Employee ID: ${attendanceData.employee?.empID || "-"}`, margin + 6, startY + 22.5);
    doc.text(
      `Monthly Salary: ${formatCurrency(attendanceData.employee?.salary)}`,
      margin + 6,
      startY + 29
    );

    // Right Card - Statement Period
    const rightBoxX = margin + boxWidth + margin;
    doc.setFillColor(...CARD_BG);
    doc.roundedRect(rightBoxX, startY, boxWidth, boxHeight, 3.5, 3.5, "F");
    doc.setDrawColor(...DIVIDER);
    doc.roundedRect(rightBoxX, startY, boxWidth, boxHeight, 3.5, 3.5, "S");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...BRAND_GREEN);
    doc.text("PERIOD DETAILS", rightBoxX + 6, startY + 8);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_SECONDARY);
    doc.text("Month:", rightBoxX + 6, startY + 16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...TEXT_PRIMARY);
    doc.text(formatAttendanceMonth(month), rightBoxX + 32, startY + 16);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(...TEXT_SECONDARY);
    doc.text("Generated:", rightBoxX + 6, startY + 22.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...TEXT_PRIMARY);
    doc.text(formatAttendanceDate(attendanceToday()), rightBoxX + 32, startY + 22.5);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(...TEXT_SECONDARY);
    doc.text("Period Days:", rightBoxX + 6, startY + 29);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...TEXT_PRIMARY);
    doc.text(`${attendanceData.period?.daysInPeriod || 0} days`, rightBoxX + 32, startY + 29);
  };

  // ========== RENDER HEADER & INFO ==========
  drawHeader();
  drawDetailsGrid(50);

  // ========== METRICS CALCULATIONS ==========
  const daysPresent = Number(attendanceData.period?.daysWorked || 0);
  const daysAbsent = Array.isArray(attendanceData.attendance)
    ? attendanceData.attendance.filter(
        (day) => day.status !== "present" && day.date <= attendanceToday()
      ).length
    : 0;
  const totalHoursWorked = Number(attendanceData.summary?.totalHoursWorked || 0);
  const avgHours = daysPresent > 0 ? (totalHoursWorked / daysPresent).toFixed(2) : "0.00";
  const salary = Number(attendanceData.summary?.grossSalary || 0);
  const advances = Number(attendanceData.summary?.totalAdvances || 0);
  const netSalary = Number(attendanceData.summary?.netSalary || 0);

  let currentY = 94;

  // Section Heading
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...BRAND_GREEN);
  doc.text("MONTHLY ATTENDANCE & SALARY SUMMARY", margin, currentY);

  currentY += 6;

  // Summary Table: Clean, modern invoice-like design with neat bottom dividers
  const summaryRows = [
    ["Days Present", `${daysPresent} days`],
    ["Absent Days (Including Leave)", `${daysAbsent} days`],
    ["Paid Leave Used", `${attendanceData.summary.paidLeaveDays || 0} days`],
    ["Excess Leave Days", `${attendanceData.summary.excessLeaveDays || 0} days`],
    ["Paid Leave Remaining", `${attendanceData.summary.remainingPaidLeave || 0} days`],
    ["Actual Hours Worked", `${totalHoursWorked}h`],
    ["Avg Hours / Day", `${avgHours}h`],
    ["Gross Salary", formatCurrency(salary)],
    ["Advances", advances > 0 ? `- ${formatCurrency(advances)}` : formatCurrency(0)],
    ["Net Salary", formatCurrency(netSalary)],
  ];

  autoTable(doc, {
    startY: currentY,
    head: [["Particulars", "Details / Amount"]],
    body: summaryRows,
    theme: "plain",
    tableWidth: contentWidth,
    margin: { left: margin, right: margin },
    headStyles: {
      fillColor: BRAND_GREEN,
      textColor: WHITE,
      fontSize: 9.5,
      fontStyle: "bold",
      halign: "left",
      cellPadding: { top: 4.5, bottom: 4.5, left: 8, right: 8 },
    },
    bodyStyles: {
      fontSize: 9,
      textColor: TEXT_PRIMARY,
      cellPadding: { top: 4, bottom: 4, left: 8, right: 8 },
    },
    alternateRowStyles: {
      fillColor: CARD_BG,
    },
    columnStyles: {
      0: { cellWidth: 100, halign: "left" },
      1: { cellWidth: "auto", halign: "right", fontStyle: "bold" },
    },
    styles: {
      lineColor: DIVIDER,
      lineWidth: { bottom: 0.2 },
    },
    didParseCell: function (data) {
      if (data.row.index === summaryRows.length - 1) {
        data.cell.styles.fillColor = BRAND_LIGHT;
        data.cell.styles.textColor = BRAND_GREEN;
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fontSize = 10;
      }
      if (data.row.index === 1 && daysAbsent > 0 && data.column.index === 1) {
        data.cell.styles.textColor = ACCENT_RED;
      }
    },
  });

  currentY = doc.lastAutoTable.finalY + 10;

  // ========== NET SALARY CALLOUT CARD ==========
  const cardHeight = 20;
  doc.setFillColor(...BRAND_LIGHT);
  doc.roundedRect(margin, currentY, contentWidth, cardHeight, 3.5, 3.5, "F");
  doc.setDrawColor(...BRAND_GREEN);
  doc.setLineWidth(0.8);
  doc.roundedRect(margin, currentY, contentWidth, cardHeight, 3.5, 3.5, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...BRAND_GREEN);
  doc.text("NET SALARY PAYABLE", margin + 8, currentY + 8.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_SECONDARY);
  doc.text("Calculated after deducting all recorded monthly advances", margin + 8, currentY + 15);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...BRAND_GREEN);
  doc.text(formatCurrency(netSalary), pageWidth - margin - 8, currentY + 13, {
    align: "right",
  });

  currentY += cardHeight + 12;

  // ========== ADVANCE PAYMENTS BREAKDOWN (IF ANY) ==========
  if (attendanceData.advances && attendanceData.advances.length > 0) {
    if (currentY > pageHeight - 65) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...BRAND_GREEN);
    doc.text("ADVANCE PAYMENTS BREAKDOWN", margin, currentY);

    currentY += 5;

    const advancesData = attendanceData.advances.map((advance) => [
      formatAttendanceDate(advance.date),
      advance.reason || "General Advance",
      formatCurrency(advance.amount),
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [["Date", "Reason", "Amount"]],
      body: advancesData,
      theme: "plain",
      tableWidth: contentWidth,
      margin: { left: margin, right: margin },
      headStyles: {
        fillColor: BRAND_GREEN,
        textColor: WHITE,
        fontSize: 9,
        fontStyle: "bold",
        halign: "left",
        cellPadding: { top: 4, bottom: 4, left: 6, right: 6 },
      },
      bodyStyles: {
        fontSize: 8.5,
        textColor: TEXT_PRIMARY,
        cellPadding: { top: 3.5, bottom: 3.5, left: 6, right: 6 },
      },
      alternateRowStyles: {
        fillColor: CARD_BG,
      },
      columnStyles: {
        0: { cellWidth: 40, halign: "left" },
        1: { cellWidth: "auto", halign: "left" },
        2: { cellWidth: 45, halign: "right", fontStyle: "bold" },
      },
      styles: {
        lineColor: DIVIDER,
        lineWidth: { bottom: 0.2 },
      },
    });

    currentY = doc.lastAutoTable.finalY + 12;
  }

  // ========== DAILY ATTENDANCE RECORDS (ATTENDANCE ROWS) ==========
  if (attendanceData.attendance && attendanceData.attendance.length > 0) {
    if (currentY > pageHeight - 75) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...BRAND_GREEN);
    doc.text("DAILY ATTENDANCE LOG", margin, currentY);

    currentY += 5;

    const attendanceRows = attendanceData.attendance.map((day) => {
      const status = ({ present: "Present", paid_leave: "Paid Leave", excess_leave: "Absent", unpaid_leave: "Absent" })[day.status] || "Absent";
      return [
        formatAttendanceDate(day.date),
        status,
        formatTime(status, day.checkIn),
        formatTime(status, day.checkOut),
        day.hoursWorked > 0 ? `${day.hoursWorked}h` : "-",
      ];
    });

    autoTable(doc, {
      startY: currentY,
      head: [["Date", "Status", "Check In (IST)", "Check Out (IST)", "Hours Worked"]],
      body: attendanceRows,
      theme: "plain",
      tableWidth: contentWidth,
      margin: { left: margin, right: margin, bottom: 25 },
      headStyles: {
        fillColor: BRAND_GREEN,
        textColor: WHITE,
        fontSize: 9,
        fontStyle: "bold",
        halign: "center",
        cellPadding: { top: 4, bottom: 4, left: 5, right: 5 },
      },
      bodyStyles: {
        fontSize: 8.5,
        textColor: TEXT_PRIMARY,
        cellPadding: { top: 3.5, bottom: 3.5, left: 5, right: 5 },
      },
      alternateRowStyles: {
        fillColor: CARD_BG,
      },
      columnStyles: {
        0: { cellWidth: 35, halign: "left" },
        1: { cellWidth: 28, halign: "center", fontStyle: "bold" },
        2: { cellWidth: 38, halign: "center" },
        3: { cellWidth: 38, halign: "center" },
        4: { cellWidth: "auto", halign: "center", fontStyle: "bold" },
      },
      styles: {
        lineColor: DIVIDER,
        lineWidth: { bottom: 0.2 },
      },
      didParseCell: function (data) {
        if (data.column.index === 1 && data.cell.text[0] === "Absent") {
          data.cell.styles.textColor = ACCENT_RED;
          data.cell.styles.fillColor = ACCENT_RED_LIGHT;
        }
        if (data.column.index === 1 && data.cell.text[0] === "Present") {
          data.cell.styles.textColor = ACCENT_GREEN;
          data.cell.styles.fillColor = ACCENT_GREEN_LIGHT;
        }
      },
    });

    currentY = doc.lastAutoTable.finalY + 12;
  }

  // ========== AUTHORIZED SIGNATURE ==========
  if (currentY > pageHeight - 35) {
    doc.addPage();
    currentY = 20;
  }

  const sigY = pageHeight - 30;
  doc.setDrawColor(...DIVIDER);
  doc.setLineWidth(0.6);
  doc.line(pageWidth - margin - 55, sigY, pageWidth - margin, sigY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...TEXT_SECONDARY);
  doc.text("Authorized Signature", pageWidth - margin - 27.5, sigY + 6, {
    align: "center",
  });

  // ========== FOOTER ==========
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const footerY = pageHeight - 14;
    doc.setFillColor(...BRAND_GREEN);
    doc.rect(0, footerY, pageWidth, 2.5, "F");

    doc.setFontSize(7.5);
    doc.setTextColor(...TEXT_SECONDARY);
    doc.setFont("helvetica", "normal");
    doc.text(
      "Computer-generated attendance & salary statement · Magizh Dairy Productions",
      margin,
      footerY + 7
    );
    doc.text(
      `Page ${i} of ${totalPages}`,
      pageWidth - margin,
      footerY + 7,
      { align: "right" }
    );
  }

  // Save PDF
  if (returnBytes) return doc.output("arraybuffer");
  doc.save(fileName ? `${fileName}.pdf` : attendanceFilename(attendanceData.employee?.name, month));
};
