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
