import { jsPDF } from 'jspdf';
import { MAHAJAN_LOGO_BASE64 } from './logoBase64.js';

// Color Palette Constants
const NAVY_PRIMARY = [15, 43, 72];     // #0f2b48 - Corporate Navy Blue
const NAVY_SECONDARY = [26, 54, 93];   // #1a365d - Deep Navy Accent
const NAVY_LIGHT = [238, 242, 246];    // #eef2f6 - Soft Tint
const TEXT_DARK = [30, 41, 59];        // #1e293b - Slate Dark Text
const TEXT_MUTED = [100, 116, 139];    // #64748b - Slate Muted Text
const BORDER_COLOR = [226, 232, 240];  // #e2e8f0 - Light Grey Divider
const BG_LIGHT = [248, 250, 252];      // #f8fafc - Card Background
const WHITE = [255, 255, 255];
const ACCENT_TEAL = [13, 148, 136];    // Teal for washroom distinction
const ACCENT_BLUE = [37, 99, 235];     // Royal blue for general cleaning

/**
 * Format date object or string into DD-MM-YYYY
 */
export function formatDisplayDate(dateInput) {
  if (!dateInput) return '';
  // If already DD-MM-YYYY
  if (/^\d{2}-\d{2}-\d{4}$/.test(dateInput)) {
    return dateInput;
  }
  // If YYYY-MM-DD from HTML date input
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    const [y, m, d] = dateInput.split('-');
    return `${d}-${m}-${y}`;
  }
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

/**
 * Generates the complete A4 PDF Inspection Report
 */
export async function generateDailyReportPDF({ reportDate, floors, onProgress }) {
  const formattedDate = formatDisplayDate(reportDate);
  const fileName = `Mahajan_Facilities_Daily_Cleaning_Report_${formattedDate}.pdf`;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2; // 182mm
  const maxY = 272; // Leave safe space for footer at 285mm

  // Compute overall statistics
  let totalGeneralPhotos = 0;
  let totalWashroomPhotos = 0;
  const floorStats = floors.map((f) => {
    const genCount = f.generalPhotos ? f.generalPhotos.length : 0;
    const washCount = f.washroomPhotos ? f.washroomPhotos.length : 0;
    totalGeneralPhotos += genCount;
    totalWashroomPhotos += washCount;
    return {
      id: f.id,
      name: f.name,
      genCount,
      washCount,
      total: genCount + washCount
    };
  });
  const grandTotalPhotos = totalGeneralPhotos + totalWashroomPhotos;

  if (onProgress) onProgress({ step: 'cover', message: 'Creating Executive Cover Page...' });

  // ==========================================
  // PAGE 1: COVER PAGE
  // ==========================================
  drawCoverPage(doc, {
    formattedDate,
    floorStats,
    totalGeneralPhotos,
    totalWashroomPhotos,
    grandTotalPhotos,
    pageWidth,
    contentWidth,
    marginX
  });

  // ==========================================
  // FOLLOWING PAGES: FLOOR-WISE PHOTO REPORT
  // ==========================================
  const totalFloors = floors.length;

  for (let floorIndex = 0; floorIndex < totalFloors; floorIndex++) {
    const floor = floors[floorIndex];
    if (onProgress) {
      onProgress({
        step: 'floor',
        current: floorIndex + 1,
        total: totalFloors,
        message: `Rendering ${floor.name} (${floorIndex + 1}/${totalFloors})...`
      });
    }

    // Add a new page for each floor to give clear distinct starting points
    doc.addPage();
    let currentY = 16;

    // Draw Floor Header Banner
    currentY = drawFloorHeader(doc, floor.name, marginX, currentY, contentWidth);

    // Render Section A: General Cleaning Photos
    currentY = await renderFloorSection(doc, {
      floorName: floor.name,
      sectionLetter: 'A',
      sectionTitle: 'General Cleaning Photos',
      badgeColor: ACCENT_BLUE,
      photos: floor.generalPhotos || [],
      currentY,
      marginX,
      contentWidth,
      maxY
    });

    // Check if Section B has room or needs clean spacing
    currentY += 4;
    if (currentY + 28 > maxY) {
      doc.addPage();
      currentY = 16;
      currentY = drawContinuationHeader(doc, floor.name, 'Section B — Washroom Cleaning Photos', marginX, currentY, contentWidth);
    }

    // Render Section B: Washroom Cleaning Photos
    currentY = await renderFloorSection(doc, {
      floorName: floor.name,
      sectionLetter: 'B',
      sectionTitle: 'Washroom Cleaning Photos',
      badgeColor: ACCENT_TEAL,
      photos: floor.washroomPhotos || [],
      currentY,
      marginX,
      contentWidth,
      maxY
    });
  }

  // ==========================================
  // PAGE FOOTERS AND NUMBERING ACROSS ALL PAGES
  // ==========================================
  if (onProgress) onProgress({ step: 'finalize', message: 'Finalizing page numbers & stamps...' });

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawPageFooter(doc, {
      pageNumber: p,
      totalPages,
      formattedDate,
      pageWidth,
      marginX
    });
  }

  const pdfBlob = doc.output('blob');
  const pdfUrl = URL.createObjectURL(pdfBlob);

  return {
    doc,
    blob: pdfBlob,
    url: pdfUrl,
    fileName,
    totalPages
  };
}

/**
 * Draws the First Page (Executive Cover Page)
 */
function drawCoverPage(doc, { formattedDate, floorStats, totalGeneralPhotos, totalWashroomPhotos, grandTotalPhotos, pageWidth, contentWidth, marginX }) {
  // Top Corporate Navy Accent Bar
  doc.setFillColor(...NAVY_PRIMARY);
  doc.rect(0, 0, pageWidth, 8, 'F');

  let y = 20;

  // Official Company Logo & Brand Header
  try {
    doc.addImage(MAHAJAN_LOGO_BASE64, 'PNG', marginX, y, 20, 20);
  } catch (err) {
    console.warn('Could not add logo to PDF:', err);
  }

  // Company Brand Name & Subtitle
  doc.setTextColor(...NAVY_PRIMARY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('MAHAJAN FACILITIES', marginX + 24, y + 8);

  doc.setTextColor(...TEXT_MUTED);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('SMART FACILITY SOLUTIONS & INTEGRATED SERVICES', marginX + 24, y + 14);

  y += 25;

  // Main Document Title
  doc.setTextColor(...NAVY_PRIMARY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('DAILY HOUSEKEEPING CLEANING REPORT', marginX, y);

  y += 7;
  doc.setTextColor(...TEXT_MUTED);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Comprehensive Daily Quality & Hygiene Inspection Documentation', marginX, y);

  y += 6;
  doc.setDrawColor(...BORDER_COLOR);
  doc.setLineWidth(0.5);
  doc.line(marginX, y, marginX + contentWidth, y);

  y += 8;

  // Summary Information Cards Grid (4 KPI Badges)
  const cardW = (contentWidth - 9) / 4; // 4 cards across
  const cardH = 22;

  const kpis = [
    { label: 'REPORT DATE', val: formattedDate, color: NAVY_PRIMARY },
    { label: 'GENERAL PHOTOS', val: String(totalGeneralPhotos), color: ACCENT_BLUE },
    { label: 'WASHROOM PHOTOS', val: String(totalWashroomPhotos), color: ACCENT_TEAL },
    { label: 'TOTAL PHOTOS', val: String(grandTotalPhotos), color: NAVY_PRIMARY }
  ];

  kpis.forEach((kpi, idx) => {
    const cx = marginX + idx * (cardW + 3);
    doc.setFillColor(...BG_LIGHT);
    doc.setDrawColor(...BORDER_COLOR);
    doc.roundedRect(cx, y, cardW, cardH, 2, 2, 'FD');

    // Colored top pill line
    doc.setFillColor(...kpi.color);
    doc.rect(cx, y, cardW, 2, 'F');

    // Label
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(kpi.label, cx + 3.5, y + 8);

    // Value
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.setTextColor(...kpi.color);
    doc.text(kpi.val, cx + 3.5, y + 16.5);
  });

  y += cardH + 10;

  // Building Coverage Header
  doc.setFillColor(...NAVY_PRIMARY);
  doc.roundedRect(marginX, y, contentWidth, 8, 1, 1, 'F');
  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('BUILDING FLOORS COVERED: Ground Floor to 12th Floor (13 Levels)', marginX + 4, y + 5.5);

  y += 12;

  // Executive Floor-Wise Breakdown Table
  doc.setTextColor(...NAVY_PRIMARY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Floor-Wise Inspection Breakdown', marginX, y);

  y += 4;

  // Table Header
  const colX = [marginX, marginX + 55, marginX + 98, marginX + 140, marginX + 182];
  doc.setFillColor(...NAVY_LIGHT);
  doc.rect(marginX, y, contentWidth, 7, 'F');
  doc.setDrawColor(...BORDER_COLOR);
  doc.rect(marginX, y, contentWidth, 7, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...NAVY_PRIMARY);
  doc.text('Floor Level', colX[0] + 3, y + 4.8);
  doc.text('General Cleaning', colX[1] + 3, y + 4.8);
  doc.text('Washroom Cleaning', colX[2] + 3, y + 4.8);
  doc.text('Total Photos', colX[3] + 3, y + 4.8);

  y += 7;

  // Table Rows (All 13 floors)
  floorStats.forEach((fs, i) => {
    const rowH = 6.2;
    if (i % 2 === 1) {
      doc.setFillColor(252, 253, 254);
      doc.rect(marginX, y, contentWidth, rowH, 'F');
    }
    doc.setDrawColor(...BORDER_COLOR);
    doc.line(marginX, y + rowH, marginX + contentWidth, y + rowH);

    // Floor name
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_DARK);
    doc.text(fs.name, colX[0] + 3, y + 4.4);

    // General count
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TEXT_DARK);
    doc.text(`${fs.genCount} photos`, colX[1] + 3, y + 4.4);

    // Washroom count
    doc.text(`${fs.washCount} photos`, colX[2] + 3, y + 4.4);

    // Total count badge
    doc.setFont('helvetica', 'bold');
    if (fs.total > 0) {
      doc.setTextColor(...NAVY_PRIMARY);
      doc.text(`${fs.total} photos`, colX[3] + 3, y + 4.4);
    } else {
      doc.setTextColor(...TEXT_MUTED);
      doc.text('0 photos', colX[3] + 3, y + 4.4);
    }

    y += rowH;
  });

  // Table Grand Total Row
  const totalRowH = 7.5;
  doc.setFillColor(...NAVY_LIGHT);
  doc.rect(marginX, y, contentWidth, totalRowH, 'F');
  doc.setDrawColor(...BORDER_COLOR);
  doc.rect(marginX, y, contentWidth, totalRowH, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...NAVY_PRIMARY);
  doc.text('Grand Total (13 Floors)', colX[0] + 3, y + 5.2);
  doc.text(`${totalGeneralPhotos} photos`, colX[1] + 3, y + 5.2);
  doc.text(`${totalWashroomPhotos} photos`, colX[2] + 3, y + 5.2);
  doc.text(`${grandTotalPhotos} photos`, colX[3] + 3, y + 5.2);

  y += totalRowH + 10;

  // Corporate Verification Notice Box
  doc.setFillColor(...BG_LIGHT);
  doc.setDrawColor(...BORDER_COLOR);
  doc.roundedRect(marginX, y, contentWidth, 16, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...NAVY_PRIMARY);
  doc.text('INSPECTION VERIFICATION NOTICE', marginX + 4, y + 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(
    'This daily inspection report has been compiled directly from high-resolution site photographic records.',
    marginX + 4,
    y + 9.8
  );
  doc.text(
    'All photo attachments are timestamped and floor-indexed in ascending sequence for facility audit compliance.',
    marginX + 4,
    y + 13.5
  );
}

/**
 * Draws the Main Floor Banner
 */
function drawFloorHeader(doc, floorName, marginX, currentY, contentWidth) {
  doc.setFillColor(...NAVY_PRIMARY);
  doc.roundedRect(marginX, currentY, contentWidth, 10, 1.5, 1.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...WHITE);
  doc.text(floorName.toUpperCase(), marginX + 5, currentY + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Mahajan Facilities Inspection Record', marginX + contentWidth - 55, currentY + 6.8);

  return currentY + 14;
}

/**
 * Draws a Floor/Section continuation header when content rolls over to a new page
 */
function drawContinuationHeader(doc, floorName, sectionName, marginX, currentY, contentWidth) {
  doc.setFillColor(...NAVY_LIGHT);
  doc.setDrawColor(...BORDER_COLOR);
  doc.roundedRect(marginX, currentY, contentWidth, 8, 1, 1, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...NAVY_PRIMARY);
  doc.text(`${floorName.toUpperCase()} (Continued) — ${sectionName}`, marginX + 4, currentY + 5.5);

  return currentY + 12;
}

/**
 * Renders a specific floor section (Section A or Section B)
 */
async function renderFloorSection(doc, { floorName, sectionLetter, sectionTitle, badgeColor, photos, currentY, marginX, contentWidth, maxY }) {
  // Check if we need a page break before the section header
  if (currentY + 22 > maxY) {
    doc.addPage();
    currentY = 16;
    currentY = drawContinuationHeader(doc, floorName, `Section ${sectionLetter} — ${sectionTitle}`, marginX, currentY, contentWidth);
  }

  // Draw Section Header
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(...BORDER_COLOR);
  doc.roundedRect(marginX, currentY, contentWidth, 7.5, 1, 1, 'FD');

  // Colored Section Indicator Pill
  doc.setFillColor(...badgeColor);
  doc.roundedRect(marginX + 2, currentY + 1.5, 16, 4.5, 1, 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...WHITE);
  doc.text(`SEC ${sectionLetter}`, marginX + 3.5, currentY + 4.7);

  // Section Name and count
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...NAVY_PRIMARY);
  doc.text(`Section ${sectionLetter} — ${sectionTitle}`, marginX + 21, currentY + 5.2);

  const countBadge = `${photos.length} Photo${photos.length === 1 ? '' : 's'}`;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(countBadge, marginX + contentWidth - 25, currentY + 5.2);

  currentY += 10.5;

  // Case 1: No photos uploaded
  if (!photos || photos.length === 0) {
    doc.setFillColor(...BG_LIGHT);
    doc.setDrawColor(...BORDER_COLOR);
    doc.setLineWidth(0.3);
    doc.roundedRect(marginX, currentY, contentWidth, 12, 1, 1, 'FD');

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(...TEXT_MUTED);
    doc.text('No photos uploaded for this section.', marginX + 5, currentY + 7.5);

    return currentY + 16;
  }

  // Case 2: Photos exist -> 2 photos per row grid layout
  const colGap = 8;
  const photoCardW = (contentWidth - colGap) / 2; // 87mm
  const photoCardH = 65;                          // 65mm card height
  const innerMaxW = photoCardW - 4;               // 83mm image width limit
  const innerMaxH = photoCardH - 11;              // 54mm image height limit
  const rowHeight = photoCardH + 5;               // 70mm total row space

  for (let i = 0; i < photos.length; i += 2) {
    // Check if this row fits on current page
    if (currentY + rowHeight > maxY) {
      doc.addPage();
      currentY = 16;
      currentY = drawContinuationHeader(doc, floorName, `Section ${sectionLetter} — ${sectionTitle}`, marginX, currentY, contentWidth);
    }

    const rowPhotos = [photos[i], photos[i + 1]].filter(Boolean);

    for (let c = 0; c < rowPhotos.length; c++) {
      const photo = rowPhotos[c];
      const photoIndex = i + c + 1;
      const cardX = marginX + c * (photoCardW + colGap);
      const cardY = currentY;

      // Card Background & Border
      doc.setFillColor(...WHITE);
      doc.setDrawColor(...BORDER_COLOR);
      doc.setLineWidth(0.35);
      doc.roundedRect(cardX, cardY, photoCardW, photoCardH, 1.5, 1.5, 'FD');

      // Aspect Ratio Fit inside innerMaxW x innerMaxH
      const aspect = photo.aspectRatio || (photo.width && photo.height ? photo.width / photo.height : 1.33);
      const boxAspect = innerMaxW / innerMaxH;

      let renderW, renderH;
      if (aspect >= boxAspect) {
        // Image is wider than box
        renderW = innerMaxW;
        renderH = innerMaxW / aspect;
      } else {
        // Image is taller than box
        renderH = innerMaxH;
        renderW = innerMaxH * aspect;
      }

      // Center within the upper photo area
      const imgX = cardX + 2 + (innerMaxW - renderW) / 2;
      const imgY = cardY + 2 + (innerMaxH - renderH) / 2;

      // Draw subtle photo container background
      doc.setFillColor(248, 250, 252);
      doc.rect(cardX + 2, cardY + 2, innerMaxW, innerMaxH, 'F');

      // Embed Image
      try {
        doc.addImage(photo.dataUrl, 'JPEG', imgX, imgY, renderW, renderH, undefined, 'FAST');
      } catch (imgErr) {
        console.error('Failed to embed image into PDF:', imgErr);
        // Fallback placeholder box
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...TEXT_MUTED);
        doc.text('[Image Render Error]', cardX + 15, cardY + 25);
      }

      // Bottom Caption Banner
      const captionY = cardY + photoCardH - 7;
      doc.setFillColor(245, 247, 250);
      doc.rect(cardX, captionY, photoCardW, 7, 'F');
      doc.setDrawColor(...BORDER_COLOR);
      doc.line(cardX, captionY, cardX + photoCardW, captionY);

      // Photo Number (e.g. Photo 01, Photo 02)
      const photoNumText = `Photo ${String(photoIndex).padStart(2, '0')}`;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...NAVY_PRIMARY);
      doc.text(photoNumText, cardX + 3.5, captionY + 4.8);

      // File name / identifier snippet
      const truncatedName = photo.name ? (photo.name.length > 22 ? photo.name.substring(0, 20) + '...' : photo.name) : '';
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(...TEXT_MUTED);
      doc.text(truncatedName, cardX + photoCardW - doc.getTextWidth(truncatedName) - 3.5, captionY + 4.8);
    }

    currentY += rowHeight;
  }

  return currentY;
}

/**
 * Draws the Professional Footer on Every Page
 */
function drawPageFooter(doc, { pageNumber, totalPages, formattedDate, pageWidth, marginX }) {
  const footerY = 286;

  // Thin separator rule
  doc.setDrawColor(...BORDER_COLOR);
  doc.setLineWidth(0.4);
  doc.line(marginX, footerY, pageWidth - marginX, footerY);

  // Left: Company & Report Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...NAVY_PRIMARY);
  doc.text('Mahajan Facilities', marginX, footerY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TEXT_MUTED);
  doc.text(' | Daily Housekeeping Cleaning Report', marginX + doc.getTextWidth('Mahajan Facilities'), footerY + 5);

  // Center: Report Date
  const centerText = `Report Date: ${formattedDate}`;
  const centerWidth = doc.getTextWidth(centerText);
  doc.text(centerText, (pageWidth - centerWidth) / 2, footerY + 5);

  // Right: Page X of Y
  const pageText = `Page ${pageNumber} of ${totalPages}`;
  const pageTextWidth = doc.getTextWidth(pageText);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...NAVY_PRIMARY);
  doc.text(pageText, pageWidth - marginX - pageTextWidth, footerY + 5);
}
