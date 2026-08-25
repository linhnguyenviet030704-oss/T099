import { apiJson } from './api';
import { LineType } from './profileLines';

export const INDEX_FAIL_COPY =
  'Index CV thất bại — hệ thống sẽ thử lại khi matching.';

export interface ParsedCvLine {
  name: LineType;
  value: string;
}

export interface CvHeaderInfo {
  full_name?: string;
  email?: string;
  phone?: string;
}

export interface IngestResponse {
  status: string;
  markdown?: string;
  lines?: ParsedCvLine[];
  header?: CvHeaderInfo;
}

export async function ingestResume(resumeId: string, accessToken: string): Promise<IngestResponse> {
  return await apiJson<IngestResponse>(`/resumes/${resumeId}/ingest`, accessToken, { method: 'POST' });
}
