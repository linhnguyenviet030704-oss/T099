import { LineType } from './profileLines';
import { UserProfileLine } from '../types';

/**
 * A line as represented inside the CV builder. It may originate from an
 * existing profile line (`sourceId` set) or be newly created in the builder
 * (`sourceId` null). `selected` controls whether it is rendered into the CV.
 */
export interface CvLine {
  key: string; // stable local key for dnd + react
  sourceId: string | null; // id in user_profile_lines, or null if new
  line_type: LineType;
  title: string;
  organization: string;
  description: string;
  start_date: string;
  end_date: string;
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
  line_type: line.line_type,
  title: line.title,
  organization: line.organization || '',
  description: line.description || '',
  start_date: line.start_date || '',
  end_date: line.end_date || '',
  selected: true,
});

export const createBlankCvLine = (): CvLine => ({
  key: crypto.randomUUID(),
  sourceId: null,
  line_type: 'experience',
  title: '',
  organization: '',
  description: '',
  start_date: '',
  end_date: '',
  selected: true,
});

export const CV_PDF_MODES = {
  wysiwyg: 'wysiwyg',
  text: 'text',
} as const;

export type CvPdfMode = (typeof CV_PDF_MODES)[keyof typeof CV_PDF_MODES];
