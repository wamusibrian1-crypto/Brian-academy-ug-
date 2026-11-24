import { jsPDF } from 'jspdf';
import { AcademicSettings, ReportCard } from '../types/academy';

export function generateReportCardPdf(
  report: ReportCard,
  settings: AcademicSettings
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  // Navy header banner
  doc.setFillColor(11, 31, 58); // #0B1F3A
  doc.rect(0, 0, pageWidth, 34, 'F');

  // Gold accent bar
  doc.setFillColor(212, 175, 55); // #D4AF37
  doc.rect(0, 34, pageWidth, 2, 'F');

  // Header text
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('BRIAN ACADEMY UG', pageWidth / 2, 14, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(226, 232, 240);
  doc.text(
    settings.schoolMotto || 'Excellence in Secondary Science & Mathematics',
    pageWidth / 2,
    21,
    { align: 'center' }
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(212, 175, 55);
  doc.text(
    `OFFICIAL ACADEMIC REPORT CARD — ${report.term.toUpperCase()} ${report.academicYear}`,
    pageWidth / 2,
    29,
    { align: 'center' }
  );

  // Student info box
  let y = 44;
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, contentWidth, 24, 2, 2, 'FD');

  doc.setTextColor(11, 31, 58);
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.text('STUDENT NAME:', margin + 4, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.text(report.studentName, margin + 36, y + 7);

  doc.setFont('helvetica', 'bold');
  doc.text('TERM / YEAR:', margin + 106, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.text(`${report.term} ${report.academicYear}`, margin + 132, y + 7);

  doc.setFont('helvetica', 'bold');
  doc.text('CLASS LEVEL:', margin + 4, y + 14);
  doc.setFont('helvetica', 'normal');
  doc.text(report.classLevel, margin + 36, y + 14);

  doc.setFont('helvetica', 'bold');
  doc.text('CONDUCT:', margin + 106, y + 14);
  doc.setFont('helvetica', 'normal');
  doc.text(report.conduct || 'Good', margin + 132, y + 14);

  doc.setFont('helvetica', 'bold');
  doc.text('OVERALL AVERAGE:', margin + 4, y + 20.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(14, 165, 233);
  doc.text(`${report.overallAverage}%`, margin + 42, y + 20.5);

  doc.setTextColor(11, 31, 58);
  doc.setFont('helvetica', 'bold');
  doc.text('GRADING SYSTEM:', margin + 106, y + 20.5);
  doc.setFont('helvetica', 'normal');
  doc.text(settings.gradingSystem.replace(/_/g, ' '), margin + 140, y + 20.5);

  // Results Table Header
  y += 32;
  const colWidths = [24, 52, 24, 18, contentWidth - 118];
  const headers = ['Subject', 'Assessment', 'Score', 'Grade', 'Subject Teacher Remark'];

  doc.setFillColor(11, 31, 58);
  doc.rect(margin, y, contentWidth, 8.5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);

  let x = margin + 2.5;
  headers.forEach((h, i) => {
    doc.text(h, x, y + 5.8);
    x += colWidths[i];
  });

  y += 8.5;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 41, 59);

  if (report.entries.length === 0) {
    doc.setDrawColor(226, 232, 240);
    doc.rect(margin, y, contentWidth, 12);
    doc.text('No subject entries recorded for this term yet.', margin + 4, y + 7.5);
    y += 12;
  } else {
    report.entries.forEach((entry, idx) => {
      const remarkLines = doc.splitTextToSize(entry.remark || '-', colWidths[4] - 4);
      const assessLines = doc.splitTextToSize(entry.assessmentTitle || '-', colWidths[1] - 4);
      const lineCount = Math.max(remarkLines.length, assessLines.length, 1);
      const rowHeight = Math.max(9, lineCount * 4.5 + 4);

      if (y + rowHeight > 250) {
        doc.addPage();
        y = 18;
      }

      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, contentWidth, rowHeight, 'F');
      }
      doc.setDrawColor(226, 232, 240);
      doc.rect(margin, y, contentWidth, rowHeight);

      let cx = margin + 2.5;
      doc.setFont('helvetica', 'bold');
      doc.text(entry.subject, cx, y + 5.5);
      cx += colWidths[0];

      doc.setFont('helvetica', 'normal');
      doc.text(assessLines, cx, y + 5.5);
      cx += colWidths[1];

      doc.text(`${entry.score} / ${entry.maxMarks}`, cx, y + 5.5);
      cx += colWidths[2];

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(14, 116, 144);
      doc.text(entry.grade || '-', cx, y + 5.5);
      doc.setTextColor(30, 41, 59);
      cx += colWidths[3];

      doc.setFont('helvetica', 'normal');
      doc.text(remarkLines, cx, y + 5.5);

      y += rowHeight;
    });
  }

  // Remarks Section
  y += 10;
  if (y > 235) {
    doc.addPage();
    y = 20;
  }

  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(255, 255, 255);

  const drawRemarkBox = (label: string, body: string) => {
    const lines = doc.splitTextToSize(body || 'No remarks entered.', contentWidth - 8);
    const boxH = Math.max(18, lines.length * 4.8 + 11);
    if (y + boxH > 265) {
      doc.addPage();
      y = 20;
    }
    doc.roundedRect(margin, y, contentWidth, boxH, 1.5, 1.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(11, 31, 58);
    doc.text(label, margin + 4, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.text(lines, margin + 4, y + 12);
    y += boxH + 5;
  };

  drawRemarkBox('CLASS / SUBJECT TEACHER REMARKS:', report.teacherRemark);
  drawRemarkBox('HEAD TEACHER / ADMINISTRATION REMARKS:', report.headTeacherRemark);

  // Signature Footer
  y += 6;
  if (y > 265) {
    doc.addPage();
    y = 24;
  }
  doc.setDrawColor(148, 163, 184);
  doc.line(margin, y + 10, margin + 62, y + 10);
  doc.line(pageWidth - margin - 62, y + 10, pageWidth - margin, y + 10);

  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(`Prepared by: ${report.preparedByName}`, margin, y + 15);
  doc.text('Head Teacher / Principal Stamp', pageWidth - margin - 62, y + 15);

  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `BRIAN ACADEMY UG · ${settings.supportPhone} · ${settings.supportEmail}`,
    pageWidth / 2,
    287,
    { align: 'center' }
  );

  const safeNum = (report.studentNumber || report.studentName || 'student')
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeTerm = (report.term || 'term').replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`BRIAN_ACADEMY_UG_ReportCard_${safeNum}_${safeTerm}.pdf`);
}
