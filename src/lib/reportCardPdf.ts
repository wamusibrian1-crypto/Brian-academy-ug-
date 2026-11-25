import { jsPDF } from 'jspdf';
import { AcademicSettings, CLASS_LEVELS, ReportCard } from '../types/academy';
import cambridgeCrestImg from '../assets/images/cambridge_academy_crest_1795600535904.jpg';

let cachedLogoDataUrl: string | null = null;

async function loadOfficialLogoDataUrl(): Promise<string | null> {
  if (cachedLogoDataUrl) return cachedLogoDataUrl;

  const candidates = [
    cambridgeCrestImg,
    '/official-logo-solid.png',
    '/official-logo.png',
  ];

  for (const url of candidates) {
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const size = 512;
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              reject(new Error('Canvas context unavailable'));
              return;
            }
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, size, size);
            ctx.drawImage(img, 0, 0, size, size);
            resolve(canvas.toDataURL('image/png'));
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = () => reject(new Error(`Failed to load ${url}`));
        img.src = url;
      });
      cachedLogoDataUrl = dataUrl;
      return dataUrl;
    } catch {
      // Try next candidate
    }
  }
  return null;
}

export async function generateReportCardPdf(
  report: ReportCard,
  settings: AcademicSettings
): Promise<void> {
  const logoDataUrl = await loadOfficialLogoDataUrl();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  // Royal Blue header banner (#124299)
  doc.setFillColor(18, 66, 153);
  doc.rect(0, 0, pageWidth, 38, 'F');

  // Golden yellow accent bar (#EAB308)
  doc.setFillColor(234, 179, 8);
  doc.rect(0, 38, pageWidth, 2, 'F');

  // High-resolution official academy logo inside crisp white frame
  if (logoDataUrl) {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin, 4.5, 29, 29, 3, 3, 'F');
    doc.addImage(logoDataUrl, 'PNG', margin + 1, 5.5, 27, 27);
  }

  const textCenterX = logoDataUrl ? (margin + 32 + (pageWidth - margin)) / 2 : pageWidth / 2;

  // Header text
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('BRIAN ACADEMY UG', textCenterX, 14, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(224, 242, 254);
  doc.text(
    settings.schoolMotto || 'LEARN. DISCOVER. EXCEL.',
    textCenterX,
    21,
    { align: 'center' }
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(250, 204, 21);
  doc.text(
    `OFFICIAL ACADEMIC REPORT CARD — ${report.term.toUpperCase()} ${report.academicYear}`,
    textCenterX,
    29.5,
    { align: 'center' }
  );

  // Student info box
  let y = 47;
  doc.setDrawColor(195, 210, 232);
  doc.setFillColor(246, 249, 254);
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
  doc.setTextColor(2, 132, 199);
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

  doc.setFillColor(18, 66, 153);
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
  doc.setTextColor(11, 31, 58);

  if (report.entries.length === 0) {
    doc.setDrawColor(219, 229, 243);
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
        doc.setFillColor(246, 249, 254);
        doc.rect(margin, y, contentWidth, rowHeight, 'F');
      }
      doc.setDrawColor(219, 229, 243);
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
      doc.setTextColor(2, 132, 199);
      doc.text(entry.grade || '-', cx, y + 5.5);
      doc.setTextColor(11, 31, 58);
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

  doc.setDrawColor(195, 210, 232);
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
    doc.setTextColor(18, 66, 153);
    doc.text(label, margin + 4, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(36, 59, 90);
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
  doc.setTextColor(36, 59, 90);
  doc.text(`Prepared by: ${report.preparedByName}`, margin, y + 15);
  doc.text('Academic Director · BRIAN ACADEMY UG', pageWidth - margin - 62, y + 15);

  doc.setFontSize(7.5);
  doc.setTextColor(82, 103, 133);
  doc.text(
    `BRIAN ACADEMY UG · LEARN. DISCOVER. EXCEL. · ${settings.supportPhone || '256753336009'} · ${settings.supportEmail || 'wamusibrian5@gmail.com'}`,
    pageWidth / 2,
    287,
    { align: 'center' }
  );

  const safeNum = (report.studentNumber || report.studentName || 'student')
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeTerm = (report.term || 'term').replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`BRIAN_ACADEMY_UG_ReportCard_${safeNum}_${safeTerm}.pdf`);
}

export async function generateOfficialCertificatePdf(params: {
  studentName: string;
  classLevel: string;
  settings: AcademicSettings;
  overallAverage?: number;
  termLabel?: string;
}): Promise<void> {
  const { studentName, classLevel, settings, overallAverage, termLabel } = params;
  const logoDataUrl = await loadOfficialLogoDataUrl();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();

  const fullClassLabel =
    CLASS_LEVELS.find((c) => c.code === classLevel)?.label || classLevel;

  // Clean white parchment canvas
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, w, h, 'F');

  // Outer Royal Blue Institutional Border
  doc.setDrawColor(18, 66, 153);
  doc.setLineWidth(3);
  doc.rect(10, 10, w - 20, h - 20);

  // Inner Golden Yellow Border
  doc.setDrawColor(234, 179, 8);
  doc.setLineWidth(1);
  doc.rect(14, 14, w - 28, h - 28);

  // Official Logo Crest centered at top
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', w / 2 - 22, 18, 44, 44);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(18, 66, 153);
  doc.text('BRIAN ACADEMY UG', w / 2, 71, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(2, 132, 199);
  doc.text(
    'PHYSICS · CHEMISTRY · BIOLOGY · MATHEMATICS',
    w / 2,
    78,
    { align: 'center' }
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.setTextColor(11, 31, 58);
  doc.text('OFFICIAL ACADEMIC CERTIFICATE', w / 2, 95, { align: 'center' });

  doc.setDrawColor(234, 179, 8);
  doc.setLineWidth(0.8);
  doc.line(w / 2 - 55, 99, w / 2 + 55, 99);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(36, 59, 90);
  doc.text('This official academic document is proudly presented to', w / 2, 111, {
    align: 'center',
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.setTextColor(18, 66, 153);
  doc.text(studentName.toUpperCase(), w / 2, 126, { align: 'center' });

  const achievementLine =
    typeof overallAverage === 'number'
      ? `for dedicated scholarly achievement in ${fullClassLabel} (${termLabel || `${settings.termName} ${settings.academicYear}`}) with an overall average of ${overallAverage}%.`
      : `as an actively enrolled secondary scholar in ${fullClassLabel} for ${termLabel || `${settings.termName} ${settings.academicYear}`}.`;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11.5);
  doc.setTextColor(36, 59, 90);
  const bodyLines = doc.splitTextToSize(achievementLine, w - 80);
  doc.text(bodyLines, w / 2, 138, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(161, 98, 7);
  doc.text(settings.schoolMotto || 'LEARN. DISCOVER. EXCEL.', w / 2, 156, {
    align: 'center',
  });

  // Signatures
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.4);
  doc.line(42, 177, 112, 177);
  doc.line(w - 112, 177, w - 42, 177);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(11, 31, 58);
  doc.text('ACADEMY DIRECTOR', 77, 183, { align: 'center' });
  doc.text('ACADEMIC REGISTRAR', w - 77, 183, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(82, 103, 133);
  doc.text('BRIAN ACADEMY UG Directorate', 77, 188, { align: 'center' });
  doc.text(`Issued ${new Date().toLocaleDateString()} · ${settings.supportPhone || '256753336009'}`, w - 77, 188, {
    align: 'center',
  });

  const safeName = (studentName || 'student').replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`BRIAN_ACADEMY_UG_Certificate_${safeName}.pdf`);
}
