import { CvLine } from './cv';
import { LineType } from './profileLines';

export type CvTemplateId =
  | 'modern'
  | 'classic'
  | 'sidebar'
  | 'compact'
  | 'elegant'
  | 'minimal'
  | 'professional'
  | 'creative'
  | 'timeline'
  | 'twocolumn';

export interface CvTemplateMeta {
  id: CvTemplateId;
  name: string;
  description: string;
  /** accent color used by the template */
  accent: string;
}

export const CV_TEMPLATES: CvTemplateMeta[] = [
  {
    id: 'modern',
    name: 'Modern',
    description: 'Thanh nhấn màu, một cột, hiện đại và rõ ràng.',
    accent: '#10b981',
  },
  {
    id: 'sidebar',
    name: 'Sidebar',
    description: 'Hai cột: cột bên màu đậm cho liên hệ & kỹ năng.',
    accent: '#0f766e',
  },
  {
    id: 'classic',
    name: 'Classic',
    description: 'Trang trọng, tiêu đề canh giữa, kiểu truyền thống.',
    accent: '#1e293b',
  },
  {
    id: 'compact',
    name: 'Compact',
    description: 'Gọn gàng, tiết kiệm không gian, nhiều nội dung.',
    accent: '#4f46e5',
  },
  {
    id: 'elegant',
    name: 'Elegant',
    description: 'Tinh tế với tiêu đề serif và đường kẻ mảnh.',
    accent: '#9333ea',
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Tối giản, đen trắng, tập trung vào nội dung.',
    accent: '#111827',
  },
  {
    id: 'professional',
    name: 'Professional',
    description: 'Khối tiêu đề màu, phù hợp môi trường doanh nghiệp.',
    accent: '#1d4ed8',
  },
  {
    id: 'creative',
    name: 'Creative',
    description: 'Nổi bật với dải màu gradient và điểm nhấn mạnh.',
    accent: '#ea580c',
  },
  {
    id: 'timeline',
    name: 'Timeline',
    description: 'Trục thời gian dọc cho kinh nghiệm & học vấn.',
    accent: '#0891b2',
  },
  {
    id: 'twocolumn',
    name: 'Two Column',
    description: 'Hai cột cân đối, header trải ngang phía trên.',
    accent: '#be123c',
  },
];

export interface CvSection {
  type: LineType;
  label: string;
  lines: CvLine[];
}

const SECTION_LABELS: Record<LineType, string> = {
  summary: 'Giới thiệu',
  experience: 'Kinh nghiệm làm việc',
  education: 'Học vấn',
  project: 'Dự án',
  skill: 'Kỹ năng',
  certification: 'Chứng chỉ',
  language: 'Ngoại ngữ',
  link: 'Liên kết',
  other: 'Thông tin khác',
};

/** Default visual ordering of sections in a CV. */
export const SECTION_ORDER: LineType[] = [
  'summary',
  'experience',
  'education',
  'project',
  'skill',
  'certification',
  'language',
  'link',
  'other',
];

/** Types that go into the sidebar column of the sidebar template. */
export const SIDEBAR_TYPES: LineType[] = [
  'skill',
  'language',
  'certification',
  'link',
];

export const sectionLabel = (type: LineType): string => SECTION_LABELS[type];

/**
 * Groups selected lines into ordered sections by type. Within each section the
 * lines keep their relative order from the input array (which reflects the
 * user's manual drag ordering).
 */
export function groupLines(
  lines: CvLine[],
  onlyTypes?: LineType[],
): CvSection[] {
  const selected = lines.filter((l) => l.selected);
  const sections: CvSection[] = [];
  for (const type of SECTION_ORDER) {
    if (onlyTypes && !onlyTypes.includes(type)) continue;
    const inType = selected.filter((l) => l.name === type);
    if (inType.length > 0) {
      sections.push({ type, label: SECTION_LABELS[type], lines: inType });
    }
  }
  return sections;
}
