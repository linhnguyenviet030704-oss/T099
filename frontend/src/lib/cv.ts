import { LineType } from './profileLines';
import { UserProfileLine } from '../types';

/**
 * A line as represented inside the CV builder. It may originate from an
 * existing profile line (`sourceId` set) or be newly created in the builder
 * (`sourceId` null). `selected` controls whether it is rendered into the CV.
 */
export interface CvLine {
  key: string;
  sourceId: string | null;
  name: LineType;
  value: string;
  selected: boolean;
}

export interface CvHeader {
  full_name: string;
  email: string;
  phone: string;
  avatar_url: string;
}

export const profileLineToCvLine = (line: UserProfileLine): CvLine => ({
  key: line.id,
  sourceId: line.id,
  name: line.name,
  value: line.value || '',
  selected: true,
});

export const createBlankCvLine = (): CvLine => ({
  key: crypto.randomUUID(),
  sourceId: null,
  name: 'experience',
  value: '',
  selected: true,
});

export const CV_PDF_MODES = {
  wysiwyg: 'wysiwyg',
  text: 'text',
} as const;

export type CvPdfMode = (typeof CV_PDF_MODES)[keyof typeof CV_PDF_MODES];

/**
 * Parses markdown / raw text into structured CvLine[] and header data.
 * Used for CV upload ingest fallback and loading CVs from CV Vault.
 */
export function parseMarkdownToCvLines(markdown: string): {
  lines: CvLine[];
  header: Partial<CvHeader>;
} {
  const lines: CvLine[] = [];
  const header: Partial<CvHeader> = {};

  let text = (markdown || '').trim();
  if (text.startsWith('---')) {
    const parts = text.split('---');
    if (parts.length >= 3) {
      text = parts.slice(2).join('---').trim();
    }
  }

  const sectionMap: Record<string, LineType> = {
    profile: 'summary',
    summary: 'summary',
    'about me': 'summary',
    'giới thiệu': 'summary',
    'tóm tắt': 'summary',
    'mục tiêu': 'summary',
    'mục tiêu nghề nghiệp': 'summary',
    'work experience': 'experience',
    experience: 'experience',
    'kinh nghiệm': 'experience',
    'kinh nghiệm làm việc': 'experience',
    'kinh nghiệm chuyên môn': 'experience',
    education: 'education',
    'học vấn': 'education',
    'trình độ học vấn': 'education',
    'technical skills': 'skill',
    skills: 'skill',
    'kỹ năng': 'skill',
    'kĩ năng': 'skill',
    'kỹ năng chuyên môn': 'skill',
    projects: 'project',
    project: 'project',
    'dự án': 'project',
    'dự án nổi bật': 'project',
    certifications: 'certification',
    certification: 'certification',
    'chứng chỉ': 'certification',
    'chứng chỉ & giải thưởng': 'certification',
    languages: 'language',
    language: 'language',
    'ngoại ngữ': 'language',
    additional: 'other',
    'additional information': 'other',
    'thông tin thêm': 'other',
    'thông tin bổ sung': 'other',
    contact: 'link',
  };

  const emailMatch = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
  if (emailMatch) header.email = emailMatch[0];

  const phoneMatch = text.match(/(?:\+?84|0)(?:\d[\s.-]?){7,8}\d/);
  if (phoneMatch) header.phone = phoneMatch[0];

  const sections = text.split(/^##\s+/m);
  if (sections.length <= 1) {
    const chunks = text.split(/\n\s*\n/).map((c) => c.trim()).filter(Boolean);
    for (const chunk of chunks) {
      if (!chunk.startsWith('#')) {
        lines.push({
          key: crypto.randomUUID(),
          sourceId: null,
          name: 'experience',
          value: chunk,
          selected: true,
        });
      }
    }
  } else {
    for (let i = 1; i < sections.length; i++) {
      const sectionText = sections[i].trim();
      const firstLineBreak = sectionText.indexOf('\n');
      const rawTitle = firstLineBreak === -1 ? sectionText : sectionText.slice(0, firstLineBreak).trim();
      const content = firstLineBreak === -1 ? '' : sectionText.slice(firstLineBreak).trim();
      if (!content) continue;

      const normTitle = rawTitle.toLowerCase().replace(/^[^\w\s]+/, '').trim();
      const secType: LineType = sectionMap[normTitle] || 'other';

      if (secType === 'experience' || secType === 'education' || secType === 'project') {
        const subBlocks = content.split(/^###\s+/m);
        if (subBlocks.length > 1) {
          for (let j = 1; j < subBlocks.length; j++) {
            const sub = subBlocks[j].trim();
            if (sub) {
              lines.push({
                key: crypto.randomUUID(),
                sourceId: null,
                name: secType,
                value: sub,
                selected: true,
              });
            }
          }
        } else {
          lines.push({
            key: crypto.randomUUID(),
            sourceId: null,
            name: secType,
            value: content,
            selected: true,
          });
        }
      } else {
        lines.push({
          key: crypto.randomUUID(),
          sourceId: null,
          name: secType,
          value: content,
          selected: true,
        });
      }
    }
  }

  return { lines, header };
}
