import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatNumberWithCommas } from "./formatNumberWithComma";

// Brand Colors - Matching invoice style
const BRAND_GREEN = [39, 121, 93];
const BRAND_LIGHT = [234, 245, 241];
const ACCENT_GOLD = [251, 188, 4];
const TEXT_PRIMARY = [30, 41, 59];
const TEXT_SECONDARY = [100, 116, 139];
const DIVIDER = [226, 232, 240];
const WHITE = [255, 255, 255];

const formatCurrency = (amount) => {
  return `Rs. ${formatNumberWithCommas(amount, 2)}`;
};

const formatTime = (time) => {
  if (!time) return "-";
  try {
    const [hours, minutes] = time.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  } catch {
    return time;
  }
};

export const exportAttendanceToPDF = (attendanceData, month, fileName) => {
  if (!attendanceData) {
    alert("No attendance data to export");
    return;
  }

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;

  // ========== HEADER SECTION ==========
  const drawHeader = () => {
    // Top accent bar
    doc.setFillColor(...BRAND_GREEN);
    doc.rect(0, 0, pageWidth, 3, "F");

    // Company name
    doc.setTextColor(...BRAND_GREEN);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(26);
    doc.text("MAGIZH AGRO PRODUCT", margin, 18);

    // Tagline
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_SECONDARY);
    doc.text("Employee Attendance & Salary Report", margin + 1, 24);

    // Company details on the right
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_PRIMARY);
    doc.setFont("helvetica", "normal");
    doc.text("GSTIN: 33ACBFM9128J1Z4", pageWidth - margin, 15, { align: "right" });
    doc.text("Gudiyatham, Tamil Nadu", pageWidth - margin, 20, { align: "right" });
    doc.text("+91 93636 46314", pageWidth - margin, 25, { align: "right" });

    // Report title banner
    doc.setFillColor(...BRAND_LIGHT);
    doc.roundedRect(margin, 38, pageWidth - margin * 2, 12, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...BRAND_GREEN);
    doc.text("ATTENDANCE REPORT", pageWidth / 2, 46, { align: "center" });
  };

  // ========== EMPLOYEE & PERIOD DETAILS ==========
  const drawDetailsGrid = (startY) => {
    const boxHeight = 38;
    const boxWidth = (pageWidth - margin * 3) / 2;

    // Left box - Employee Info
    doc.setDrawColor(...DIVIDER);
    doc.setLineWidth(0.5);
    doc.roundedRect(margin, startY, boxWidth, boxHeight, 3, 3);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...BRAND_GREEN);
    doc.text("EMPLOYEE INFORMATION", margin + 5, startY + 8);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...TEXT_PRIMARY);
    doc.text(attendanceData.employee.name, margin + 5, startY + 16);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_SECONDARY);
    doc.text(`Employee ID: ${attendanceData.employee.empID}`, margin + 5, startY + 22);
    doc.text(
      `Monthly Salary: ${formatCurrency(attendanceData.employee.salary)}`,
      margin + 5,
      startY + 28
    );

    // Right box - Period Details
    const rightBoxX = margin * 2 + boxWidth;
    doc.roundedRect(rightBoxX, startY, boxWidth, boxHeight, 3, 3);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...BRAND_GREEN);
    doc.text("PERIOD DETAILS", rightBoxX + 5, startY + 8);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_PRIMARY);

    doc.text("Report Month:", rightBoxX + 5, startY + 16);
    doc.setFont("helvetica", "bold");
    doc.text(month, rightBoxX + 35, startY + 16);

    doc.setFont("helvetica", "normal");
    doc.text("Generated:", rightBoxX + 5, startY + 22);
    doc.setFont("helvetica", "bold");
    doc.text(new Date().toLocaleDateString("en-IN"), rightBoxX + 35, startY + 22);

    doc.setFont("helvetica", "normal");
    doc.text("Days in Period:", rightBoxX + 5, startY + 28);
    doc.setFont("helvetica", "bold");
    doc.text(`${attendanceData.period.daysInPeriod}`, rightBoxX + 35, startY + 28);
  };

  // ========== RENDER DOCUMENT ==========
  drawHeader();
  drawDetailsGrid(56);

  // ========== SALARY SUMMARY SECTION ==========
  let currentY = 100;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...BRAND_GREEN);
  doc.text("SALARY SUMMARY", margin, currentY);

  currentY += 8;

  const summaryData = [
    ["Days Worked", `${attendanceData.period.daysWorked} days`],
    ["Standard Hours", `${attendanceData.summary.standardHours} hours`],
    ["Regular Hours", `${attendanceData.summary.totalRegularHours} hours`],
    ["Overtime Hours", `${attendanceData.summary.totalOvertimeHours} hours`],
    ["Total Hours Worked", `${attendanceData.summary.totalHoursWorked} hours`],
    ["Hourly Rate", `${formatCurrency(attendanceData.summary.hourlyRate)}/hour`],
    ["Regular Pay", formatCurrency(attendanceData.summary.regularPay)],
    ["Overtime Pay", formatCurrency(attendanceData.summary.overtimePay)],
    ["Gross Salary", formatCurrency(attendanceData.summary.grossSalary)],
    ["Total Advances", `- ${formatCurrency(attendanceData.summary.totalAdvances)}`],
  ];

  autoTable(doc, {
    startY: currentY,
    head: [["Description", "Value"]],
    body: summaryData,
    theme: "plain",
    headStyles: {
      fillColor: BRAND_GREEN,
      textColor: WHITE,
      fontSize: 10,
      fontStyle: "bold",
      halign: "center",
      cellPadding: { top: 4, bottom: 4, left: 5, right: 5 },
    },
    bodyStyles: {
      fontSize: 9,
      textColor: TEXT_PRIMARY,
      cellPadding: { top: 3, bottom: 3, left: 5, right: 5 },
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 80, halign: "left" },
      1: { cellWidth: "auto", halign: "right", fontStyle: "bold" },
    },
    styles: {
      lineColor: DIVIDER,
      lineWidth: 0.3,
    },
  });

  currentY = doc.lastAutoTable.finalY + 5;

  // Net Salary Highlight Box
  doc.setFillColor(...BRAND_GREEN);
  doc.roundedRect(margin, currentY, pageWidth - margin * 2, 12, 2, 2, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...WHITE);
  doc.text("NET SALARY", margin + 5, currentY + 8);
  doc.setFontSize(14);
  doc.text(
    formatCurrency(attendanceData.summary.netSalary),
    pageWidth - margin - 5,
    currentY + 8,
    { align: "right" }
  );

  currentY += 18;

  // ========== ADVANCE PAYMENTS SECTION ==========
  if (attendanceData.advances && attendanceData.advances.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...BRAND_GREEN);
    doc.text("ADVANCE PAYMENTS", margin, currentY);

    currentY += 8;

    const advancesData = attendanceData.advances.map((advance) => [
      advance.date,
      formatCurrency(advance.amount),
      advance.reason || "-",
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [["Date", "Amount", "Reason"]],
      body: advancesData,
      theme: "plain",
      headStyles: {
        fillColor: BRAND_GREEN,
        textColor: WHITE,
        fontSize: 10,
        fontStyle: "bold",
        halign: "center",
        cellPadding: { top: 4, bottom: 4, left: 5, right: 5 },
      },
      bodyStyles: {
        fontSize: 9,
        textColor: TEXT_PRIMARY,
        cellPadding: { top: 3, bottom: 3, left: 5, right: 5 },
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { cellWidth: 35, halign: "left" },
        1: { cellWidth: 40, halign: "right", fontStyle: "bold" },
        2: { cellWidth: "auto", halign: "left" },
      },
      styles: {
        lineColor: DIVIDER,
        lineWidth: 0.3,
      },
    });

    currentY = doc.lastAutoTable.finalY + 15;
  } else {
    currentY += 10;
  }

  // ========== DAILY ATTENDANCE RECORDS ==========
  // Check if we need a new page
  if (currentY > pageHeight - 80) {
    doc.addPage();
    currentY = 20;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...BRAND_GREEN);
  doc.text("DAILY ATTENDANCE RECORDS", margin, currentY);

  currentY += 8;

  if (attendanceData.attendance && attendanceData.attendance.length > 0) {
    const attendanceRows = attendanceData.attendance.map((day) => [
      day.date,
      formatTime(day.checkIn),
      formatTime(day.checkOut),
      `${day.hoursWorked}h`,
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [["Date", "Check In", "Check Out", "Hours Worked"]],
      body: attendanceRows,
      theme: "plain",
      headStyles: {
        fillColor: BRAND_GREEN,
        textColor: WHITE,
        fontSize: 10,
        fontStyle: "bold",
        halign: "center",
        cellPadding: { top: 4, bottom: 4, left: 5, right: 5 },
      },
      bodyStyles: {
        fontSize: 9,
        textColor: TEXT_PRIMARY,
        cellPadding: { top: 3, bottom: 3, left: 5, right: 5 },
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { cellWidth: 35, halign: "left" },
        1: { cellWidth: 35, halign: "center" },
        2: { cellWidth: 35, halign: "center" },
        3: { cellWidth: "auto", halign: "center", fontStyle: "bold" },
      },
      styles: {
        lineColor: DIVIDER,
        lineWidth: 0.3,
      },
    });
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_SECONDARY);
    doc.text("No attendance records found for this period", margin + 5, currentY);
  }

  // ========== SIGNATURE SECTION ==========
  const sigY = pageHeight - 30;
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
    "This is a computer-generated attendance report",
    pageWidth / 2,
    footerY + 7,
    { align: "center" }
  );

  // Save PDF
  doc.save(`${fileName || "attendance-report"}.pdf`);
};
