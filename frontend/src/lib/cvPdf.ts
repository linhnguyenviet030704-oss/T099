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

  // Create an isolated container outside any CSS transforms or responsive constraints.
  // On mobile devices, parent containers have CSS `transform: scale(...)` which causes html2canvas
  // to calculate scaled bounding boxes while drawing at normal scale, collapsing all text vertically.
  const container = document.createElement('div');
  container.setAttribute('data-cv-export-container', 'true');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '794px'; // 210mm at 96 DPI
  container.style.minHeight = '1123px'; // 297mm at 96 DPI
  container.style.margin = '0';
  container.style.padding = '0';
  container.style.boxSizing = 'border-box';
  container.style.transform = 'none';
  container.style.zIndex = '-99999';
  container.style.backgroundColor = '#ffffff';
  container.style.colorScheme = 'light';
  container.style.pointerEvents = 'none';

  const clone = node.cloneNode(true) as HTMLElement;
  clone.style.width = '794px';
  clone.style.transform = 'none';
  clone.style.margin = '0';
  clone.style.boxSizing = 'border-box';

  container.appendChild(clone);
  document.body.appendChild(container);

  try {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }

    // scale 2.0 delivers crisp ~200 DPI print quality without ballooning memory or file size
    const canvas = await html2canvas(clone, {
      scale: 2.0,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: 1200, // Simulates desktop viewport to avoid mobile wrapping/squishing
      width: 794,
      scrollX: 0,
      scrollY: 0,
      x: 0,
      y: 0,
    });

    const pdf = new jsPDF({
      orientation: 'p',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });
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

    // High quality JPEG (0.94) provides visually lossless text sharpness with 95% smaller file size (~400KB vs 8MB)
    const jpegQuality = 0.94;

    // If fitToSinglePage requested OR document fits within 1 page with bottom margin
    if (options?.fitToSinglePage || canvas.height <= canvasPageHeight - bottomMarginCanvas) {
      const imgData = canvas.toDataURL('image/jpeg', jpegQuality);
      const maxAllowedHeight = pageHeightMm - (pageHeightMm * bottomMarginRatio);
      const naturalHeight = (canvas.height * pageWidthMm) / canvas.width;

      if (naturalHeight <= maxAllowedHeight) {
        pdf.addImage(imgData, 'JPEG', 0, 0, pageWidthMm, naturalHeight, undefined, 'FAST');
      } else {
        // Scale down proportionally to fit the single page without vertical distortion
        const fitHeight = maxAllowedHeight;
        const fitWidth = (canvas.width * fitHeight) / canvas.height;
        const xOffset = Math.max(0, (pageWidthMm - fitWidth) / 2);
        pdf.addImage(imgData, 'JPEG', xOffset, 0, fitWidth, fitHeight, undefined, 'FAST');
      }
      return pdf.output('blob');
    }

    // Multi-page element-aware smart splitting with 1/10th top and bottom margins
    const rootRect = clone.getBoundingClientRect();
    const scale = canvas.width / (clone.offsetWidth || rootRect.width || 794);

    // Collect candidate break locations before children elements
    const elements = Array.from(
      clone.querySelectorAll('h1, h2, h3, h4, p, ul, li, div, [data-entry-item]')
    ) as HTMLElement[];

    const safeBreakPoints: number[] = [];
    elements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.height > 0 && el !== clone) {
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

      const pageImgData = pageCanvas.toDataURL('image/jpeg', jpegQuality);
      pdf.addImage(pageImgData, 'JPEG', 0, 0, pageWidthMm, pageHeightMm, undefined, 'FAST');

      currentY += sliceHeight;
      pageIndex++;
    }

    return pdf.output('blob');
  } finally {
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }
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
  y += 10;

  // Header — contact line
  const contactBits = [header.email, header.phone].filter(Boolean);
  if (contactBits.length) {
    pdf.setFont(fontName, 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(75, 85, 99);
    pdf.text(contactBits.join('   •   '), marginX, y);
    y += 8;
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
