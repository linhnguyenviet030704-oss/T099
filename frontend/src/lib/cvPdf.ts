import { CvHeader, CvLine } from './cv';
import { LineType } from './profileLines';
import { SECTION_ORDER, sectionLabel } from './cvTemplates';
import { parseIndentedEntry } from './entryFormat';

const hexToRgb = (hex: string): [number, number, number] => {
  const m = hex.replace('#', '');
  const n = parseInt(
    m.length === 3
      ? m.split('').map((c) => c + c).join('')
      : m,
    16,
  );
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export interface WysiwygPdfOptions {
  fitToSinglePage?: boolean;
}

/**
 * WYSIWYG mode: rasterizes a DOM node into an A4 PDF using html2canvas + jsPDF.
 * Uses an element-aware smart page break algorithm to ensure no text line,
 * heading, or bullet item is sliced in half across pages, and prevents overflow.
 */
export async function generateWysiwygPdf(
  node: HTMLElement,
  options?: WysiwygPdfOptions,
): Promise<Blob> {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ]);

  const canvas = await html2canvas(node, {
    scale: 3,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  });

  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidthMm = pdf.internal.pageSize.getWidth(); // 210 mm
  const pageHeightMm = pdf.internal.pageSize.getHeight(); // 297 mm

  const a4Ratio = pageHeightMm / pageWidthMm; // ~1.4142857
  const canvasPageHeight = canvas.width * a4Ratio;

  // 1/10th page margins (10% of page height)
  const topMarginRatio = 0.10;
  const bottomMarginRatio = 0.10;
  const topMarginCanvas = Math.round(canvasPageHeight * topMarginRatio);
  const bottomMarginCanvas = Math.round(canvasPageHeight * bottomMarginRatio);
  const usableHeightCanvas = canvasPageHeight - topMarginCanvas - bottomMarginCanvas; // 80%

  // If fitToSinglePage requested OR document fits within 1 page with bottom margin
  if (options?.fitToSinglePage || canvas.height <= canvasPageHeight - bottomMarginCanvas) {
    const imgData = canvas.toDataURL('image/png');
    const imgWidth = pageWidthMm;
    const imgHeight = Math.min(pageHeightMm - (pageHeightMm * bottomMarginRatio), (canvas.height * imgWidth) / canvas.width);
    pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
    return pdf.output('blob');
  }

  // Multi-page element-aware smart splitting with 1/10th top and bottom margins
  const rootRect = node.getBoundingClientRect();
  const scale = canvas.width / (node.offsetWidth || rootRect.width || 1);

  // Collect candidate break locations before children elements
  const elements = Array.from(
    node.querySelectorAll('h1, h2, h3, h4, p, ul, li, div, [data-entry-item]')
  ) as HTMLElement[];

  const safeBreakPoints: number[] = [];
  elements.forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.height > 0 && el !== node) {
      const topInCanvas = (rect.top - rootRect.top) * scale;
      if (topInCanvas > 10 && topInCanvas < canvas.height - 10) {
        safeBreakPoints.push(Math.round(topInCanvas));
      }
    }
  });

  const sortedBreakPoints = Array.from(new Set(safeBreakPoints)).sort((a, b) => a - b);

  let currentY = 0;
  let pageIndex = 0;

  while (currentY < canvas.height - 5) {
    if (pageIndex > 0) {
      pdf.addPage();
    }

    const remainingHeight = canvas.height - currentY;
    const isFirstPage = pageIndex === 0;

    // First page starts at top of template (0), so it has max slice = canvasPageHeight - bottomMarginCanvas (90%)
    // Subsequent pages start below top margin, so max slice = usableHeightCanvas (80%)
    const maxSliceForThisPage = isFirstPage
      ? canvasPageHeight - bottomMarginCanvas
      : usableHeightCanvas;

    const yStartInPage = isFirstPage ? 0 : topMarginCanvas;

    let sliceHeight = maxSliceForThisPage;

    if (remainingHeight <= maxSliceForThisPage) {
      sliceHeight = remainingHeight;
    } else {
      const targetEnd = currentY + maxSliceForThisPage;
      const minAcceptableEnd = targetEnd - canvasPageHeight * 0.28;

      let bestBreak = targetEnd;
      for (let i = sortedBreakPoints.length - 1; i >= 0; i--) {
        const bp = sortedBreakPoints[i];
        if (bp <= targetEnd && bp >= minAcceptableEnd) {
          bestBreak = bp;
          break;
        }
      }

      sliceHeight = Math.max(maxSliceForThisPage * 0.45, bestBreak - currentY);
    }

    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = canvas.width;
    pageCanvas.height = Math.round(canvasPageHeight);
    const ctx = pageCanvas.getContext('2d');

    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      ctx.drawImage(
        canvas,
        0,
        Math.round(currentY),
        canvas.width,
        Math.round(sliceHeight),
        0,
        Math.round(yStartInPage),
        canvas.width,
        Math.round(sliceHeight)
      );
    }

    const pageImgData = pageCanvas.toDataURL('image/png');
    pdf.addImage(pageImgData, 'PNG', 0, 0, pageWidthMm, pageHeightMm);

    currentY += sliceHeight;
    pageIndex++;
  }

  return pdf.output('blob');
}

/**
 * Text-based mode: builds a structured, selectable-text PDF with jsPDF.
 * Sharp vector text and small file size.
 *
 * NOTE on Vietnamese: jsPDF's built-in Helvetica is WinAnsi-only and cannot
 * render full Vietnamese diacritics. To keep text crisp AND correct, we embed
 * a Unicode TTF (Roboto) at runtime if available; otherwise we fall back to
 * Helvetica. The WYSIWYG mode remains the guaranteed-correct option for VN.
 */
export async function generateTextPdf(
  header: CvHeader,
  lines: CvLine[],
  accent = '#10b981',
  docNode?: HTMLElement,
  lang: 'vi' | 'en' = 'vi',
  customTitles?: Partial<Record<LineType, string>>,
): Promise<Blob> {
  const { default: jsPDF } = await import('jspdf');
  const pdf = new jsPDF('p', 'mm', 'a4');
  const [ar, ag, ab] = hexToRgb(accent);

  let fontLoaded = false;
  try {
    const font = await loadRobotoFont();
    if (font) {
      pdf.addFileToVFS('Roboto-Regular.ttf', font.regular);
      pdf.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
      if (font.bold) {
        pdf.addFileToVFS('Roboto-Bold.ttf', font.bold);
        pdf.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');
      }
      fontLoaded = true;
    }
  } catch {
    fontLoaded = false;
  }

  // Fall back to WYSIWYG rasterization if font loading failed, preventing garbled Vietnamese text
  if (!fontLoaded && docNode) {
    return generateWysiwygPdf(docNode);
  }

  const fontName = fontLoaded ? 'Roboto' : 'helvetica';

  const marginX = 16;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - marginX * 2;
  const topMargin = Math.round(pageHeight * 0.10); // ~29.7 mm (1/10 page height)
  const bottomMargin = Math.round(pageHeight * 0.10); // ~29.7 mm (1/10 page height)
  let y = topMargin;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - bottomMargin) {
      pdf.addPage();
      y = topMargin;
    }
  };

  // Header — name
  pdf.setFont(fontName, 'bold');
  pdf.setFontSize(24);
  pdf.setTextColor(17, 24, 39);
  pdf.text(
    header.full_name || (lang === 'en' ? 'Full Name' : 'Họ và tên'),
    marginX,
    y,
  );
  y += 8;

  // Header — contact line
  const contactBits = [header.email, header.phone].filter(Boolean);
  if (contactBits.length) {
    pdf.setFont(fontName, 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(75, 85, 99);
    pdf.text(contactBits.join('   •   '), marginX, y);
    y += 6;
  }

  // Accent divider
  pdf.setDrawColor(ar, ag, ab);
  pdf.setLineWidth(0.8);
  pdf.line(marginX, y, pageWidth - marginX, y);
  y += 9;

  const selected = lines.filter((l) => l.selected);

  // Group by section type in canonical order.
  for (const type of SECTION_ORDER) {
    const inType = selected.filter((l) => l.name === (type as LineType));
    if (inType.length === 0) continue;

    ensureSpace(14);
    pdf.setFont(fontName, 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(ar, ag, ab);
    pdf.text(sectionLabel(type, lang, customTitles).toUpperCase(), marginX, y);
    y += 2;
    pdf.setDrawColor(229, 231, 235);
    pdf.setLineWidth(0.3);
    pdf.line(marginX, y, pageWidth - marginX, y);
    y += 6;


    for (const line of inType) {
      const rawText = line.value || '';
      const parsedItems = parseIndentedEntry(rawText);

      for (const item of parsedItems) {
        ensureSpace(12);

        if (item.level === 0) {
          pdf.setFont(fontName, item.isHeader ? 'bold' : 'normal');
          pdf.setFontSize(item.isHeader ? 10.5 : 10);
          pdf.setTextColor(17, 24, 39);

          const valueLines = pdf.splitTextToSize(item.text, contentWidth);
          ensureSpace(valueLines.length * 5);
          pdf.text(valueLines, marginX, y);
          y += valueLines.length * 5 + (item.isHeader ? 2 : 3);
        } else {
          pdf.setFont(fontName, 'normal');
          pdf.setFontSize(item.level > 2 ? 9.5 : 10);
          pdf.setTextColor(55, 65, 81);

          const bulletChar = item.level === 2 ? '◦' : item.level >= 3 ? '▪' : '•';
          const indentOffset = (item.level - 1) * 6 + 4;
          const availWidth = contentWidth - indentOffset - 4;
          const displayStr = item.isBullet ? `${bulletChar}  ${item.text}` : item.text;

          const valueLines = pdf.splitTextToSize(displayStr, availWidth);
          ensureSpace(valueLines.length * 5);
          pdf.text(valueLines, marginX + indentOffset, y);
          y += valueLines.length * 5 + 2;
        }
      }
      y += 3;
    }
    y += 3;
  }

  return pdf.output('blob');
}

async function fetchFirstSuccessful(urls: string[]): Promise<string> {
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      let binary = '';
      const bytes = new Uint8Array(buf);
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(
          null,
          Array.from(bytes.subarray(i, i + chunk)),
        );
      }
      return btoa(binary);
    } catch {
      continue;
    }
  }
  throw new Error('All font URLs failed');
}

/**
 * Loads a Roboto Unicode font (base64) from CDN for Vietnamese support in the
 * text PDF. Cached in module scope. Returns null on failure so the caller can
 * gracefully fall back.
 */
let cachedFont: { regular: string; bold: string | null } | null = null;
let fontAttempted = false;

async function loadRobotoFont(): Promise<{
  regular: string;
  bold: string | null;
} | null> {
  if (cachedFont) return cachedFont;
  if (fontAttempted) return cachedFont;
  fontAttempted = true;

  const regularUrls = [
    'https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxK.ttf',
    'https://cdn.jsdelivr.net/gh/google/fonts/apache/roboto/static/Roboto-Regular.ttf',
  ];

  const boldUrls = [
    'https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmWUlfBB4L.ttf',
    'https://cdn.jsdelivr.net/gh/google/fonts/apache/roboto/static/Roboto-Bold.ttf',
  ];

  try {
    const regular = await fetchFirstSuccessful(regularUrls);
    const bold = await fetchFirstSuccessful(boldUrls).catch(() => null);
    cachedFont = { regular, bold };
    return cachedFont;
  } catch {
    return null;
  }
}
