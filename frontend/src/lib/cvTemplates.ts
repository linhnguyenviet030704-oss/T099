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

export const SECTION_LABELS_VI: Record<LineType, string> = {
  summary: 'Giới thiệu bản thân',
  education: 'Trình độ học vấn',
  experience: 'Kinh nghiệm làm việc',
  project: 'Dự án',
  skill: 'Kỹ năng',
  certification: 'Chứng chỉ',
  language: 'Ngoại ngữ',
  link: 'Liên kết',
  other: 'Thông tin bổ sung',
};

export const SECTION_LABELS_EN: Record<LineType, string> = {
  summary: 'Summary',
  education: 'Education',
  experience: 'Work Experience',
  project: 'Projects',
  skill: 'Skills',
  certification: 'Certifications',
  language: 'Languages',
  link: 'Links',
  other: 'Additional Information',
};

export const SECTION_LABELS: Record<LineType, string> = SECTION_LABELS_VI;

/** Default visual ordering of sections in a CV. */
export const SECTION_ORDER: LineType[] = [
  'summary',
  'education',
  'experience',
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

export const getSectionLabel = (
  type: LineType,
  lang: 'vi' | 'en' = 'vi',
  customTitles?: Partial<Record<LineType, string>>,
): string => {
  if (customTitles?.[type]?.trim()) {
    return customTitles[type]!.trim();
  }
  const dict = lang === 'en' ? SECTION_LABELS_EN : SECTION_LABELS_VI;
  return dict[type] ?? SECTION_LABELS_VI[type] ?? type;
};

export const sectionLabel = (
  type: LineType,
  lang: 'vi' | 'en' = 'vi',
  customTitles?: Partial<Record<LineType, string>>,
): string => getSectionLabel(type, lang, customTitles);

/**
 * Groups selected lines into ordered sections by type. Within each section the
 * lines keep their relative order from the input array (which reflects the
 * user's manual drag ordering).
 */
export function groupLines(
  lines: CvLine[],
  onlyTypes?: LineType[],
  lang: 'vi' | 'en' = 'vi',
  customTitles?: Partial<Record<LineType, string>>,
): CvSection[] {
  const selected = lines.filter((l) => l.selected);
  const sections: CvSection[] = [];
  for (const type of SECTION_ORDER) {
    if (onlyTypes && !onlyTypes.includes(type)) continue;
    const inType = selected.filter((l) => l.name === type);
    if (inType.length > 0) {
      const label = getSectionLabel(type, lang, customTitles);
      sections.push({ type, label, lines: inType });
    }
  }
  return sections;
}

export interface StarterLine {
  name: LineType;
  value: string;
}

export const SAMPLE_CV_LINES_VI: StarterLine[] = [
  {
    name: 'summary',
    value:
      'Kỹ sư phần mềm với hơn 3 năm kinh nghiệm trong việc thiết kế và phát triển các hệ thống web quy mô lớn bằng React, TypeScript, Node.js và đám mây. Đam mê tối ưu hiệu năng và trải nghiệm người dùng.',
  },
  {
    name: 'experience',
    value:
      'Senior Frontend Developer | VNG Corporation | 06/2022 - Hiện tại\n- Chủ trì phát triển các tính năng giao diện phục vụ hơn 2.000.000 người dùng hàng tháng.\n- Tối ưu hóa bundle và áp dụng kỹ thuật Lazy Loading, giảm 45% thời gian tải trang.\n- Xây dựng hệ thống Design System dùng chung cho 3 sản phẩm chủ lực của công ty.',
  },
  {
    name: 'experience',
    value:
      'Full-stack Developer | FPT Software | 08/2020 - 05/2022\n- Xây dựng RESTful API và microservices backend xử lý hơn 10.000 giao dịch/ngày.\n- Tích hợp cổng thanh toán trực tuyến và hệ thống xác thực người dùng bảo mật cao.\n- Phối hợp chặt chẽ với đội ngũ Product và QA để triển khai CI/CD tự động.',
  },
  {
    name: 'education',
    value:
      'Kỹ sư Công nghệ Thông tin | Đại học Bách Khoa TP.HCM | 2016 - 2020\n- Xếp loại: Giỏi (GPA: 3.65 / 4.0)\n- Đạt giải Nhì cuộc thi Olympic Tin học Sinh viên cấp trường năm 2019.',
  },
  {
    name: 'skill',
    value:
      'Ngôn ngữ & Framework: JavaScript, TypeScript, React, Next.js, Node.js, Express, Python\nCơ sở dữ liệu & DevOps: PostgreSQL, MongoDB, Redis, Docker, Git, AWS (S3, EC2)\nKỹ năng mềm: Quản lý dự án Agile/Scrum, Làm việc nhóm, Giải quyết vấn đề',
  },
  {
    name: 'project',
    value:
      'Nền tảng Tuyển dụng Thông minh | 2023 - 2024\n- Vai trò: Trưởng nhóm phát triển Full-stack (Nhóm 4 người)\n- Tính năng: Tự động trích xuất thông tin CV, gợi ý việc làm theo kỹ năng bằng AI.\n- Công nghệ sử dụng: React, Tailwind CSS, Python FastAPI, PostgreSQL, Supabase.',
  },
  {
    name: 'certification',
    value:
      'AWS Certified Solutions Architect – Associate | Amazon Web Services | 2023\nTOEIC 850/990 | IIG Vietnam | 2022',
  },
  {
    name: 'language',
    value:
      'Tiếng Việt: Bản ngữ\nTiếng Anh: Thành thạo (Giao tiếp tốt trong công việc và đọc hiểu tài liệu chuyên ngành)',
  },
];

export const SAMPLE_CV_LINES_EN: StarterLine[] = [
  {
    name: 'summary',
    value:
      'Software Engineer with 3+ years of experience in building scalable web applications using React, TypeScript, Node.js, and cloud technologies. Passionate about UI/UX performance optimization and modern software architecture.',
  },
  {
    name: 'experience',
    value:
      'Senior Frontend Developer | Tech Corp | Jun 2022 - Present\n- Led development of key customer-facing features serving 2M+ active users.\n- Optimized bundle size and implemented lazy loading, reducing page load time by 45%.\n- Built and maintained a reusable design system adopted across 3 core products.',
  },
  {
    name: 'experience',
    value:
      'Full-stack Developer | Global Software Solutions | Aug 2020 - May 2022\n- Developed high-throughput RESTful APIs and microservices handling 10k+ daily transactions.\n- Integrated third-party payment gateways and implemented secure authentication flows.\n- Collaborated with QA and Product teams to configure automated CI/CD pipelines.',
  },
  {
    name: 'education',
    value:
      'B.S. in Computer Science | University of Technology | 2016 - 2020\n- Honors: Magna Cum Laude (GPA: 3.65 / 4.0)\n- 2nd Prize in University Informatics Competition 2019.',
  },
  {
    name: 'skill',
    value:
      'Languages & Frameworks: JavaScript, TypeScript, React, Next.js, Node.js, Express, Python\nDatabases & Cloud: PostgreSQL, MongoDB, Redis, Docker, Git, AWS (S3, EC2)\nCore Competencies: Agile/Scrum, Problem Solving, System Design, Team Leadership',
  },
  {
    name: 'project',
    value:
      'Smart Hiring & Recruitment Platform | 2023 - 2024\n- Role: Lead Full-stack Developer (Team of 4)\n- Features: Automated CV parsing, skill extraction, and AI-driven candidate recommendation.\n- Stack: React, Tailwind CSS, Python FastAPI, PostgreSQL, Supabase.',
  },
  {
    name: 'certification',
    value:
      'AWS Certified Solutions Architect – Associate | Amazon Web Services | 2023\nTOEIC 850/990 | IIG Vietnam | 2022',
  },
  {
    name: 'language',
    value:
      'Vietnamese: Native\nEnglish: Professional Working Proficiency (Fluent written and spoken)',
  },
];

export function getTemplateStarterLines(lang: 'vi' | 'en' = 'vi'): CvLine[] {
  const sample = lang === 'en' ? SAMPLE_CV_LINES_EN : SAMPLE_CV_LINES_VI;
  return sample.map((item) => ({
    key: crypto.randomUUID(),
    sourceId: null,
    name: item.name,
    value: item.value,
    selected: true,
  }));
}

