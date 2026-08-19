import { apiJson } from './api';

export const INDEX_FAIL_COPY =
  'Index CV thất bại — hệ thống sẽ thử lại khi matching.';

export async function ingestResume(resumeId: string, accessToken: string): Promise<void> {
  await apiJson(`/resumes/${resumeId}/ingest`, accessToken, { method: 'POST' });
}
