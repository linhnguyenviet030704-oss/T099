import { CvHeader, CvLine } from './cv';
import { LineType } from './profileLines';
import { SECTION_ORDER, sectionLabel } from './cvTemplates';

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

/**
 * WYSIWYG mode: rasterizes a DOM node into a multi-page A4 PDF using
 * html2canvas + jsPDF. Produces a pixel-perfect copy of the live preview
 * and renders Vietnamese diacritics reliably (they are part of the bitmap).
 */
export async function generateWysiwygPdf(node: HTMLElement): Promise<Blob> {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ]);

  const canvas = await html2canvas(node, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  });

  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  // Use JPEG 82% quality to compress A4 canvas from ~10MB down to ~400KB
  const imgData = canvas.toDataURL('image/jpeg', 0.82);

  let heightLeft = imgHeight;
  let position = 0;

  pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position -= pageHeight;
    pdf.addPage();
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
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
  let y = 20;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 16) {
      pdf.addPage();
      y = 20;
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
      const items = rawText
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);

      for (const itemStr of items) {
        ensureSpace(12);
        pdf.setFont(fontName, 'normal');
        pdf.setFontSize(10);
        pdf.setTextColor(55, 65, 81);

        const cleanItem = itemStr.replace(/^[-*•\s]+/, '').trim();
        const displayStr = items.length > 1 ? `•  ${cleanItem}` : itemStr;
        const valueLines = pdf.splitTextToSize(displayStr, contentWidth - 4);
        ensureSpace(valueLines.length * 5);
        pdf.text(valueLines, marginX + (items.length > 1 ? 2 : 0), y);
        y += valueLines.length * 5 + 3;
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
