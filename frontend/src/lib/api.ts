import { API_BASE_URL } from './env';

export async function apiJson<T>(
  path: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<T> {
  if (!API_BASE_URL) {
    throw new Error('VITE_API_BASE_URL chưa được cấu hình.');
  }
  const response = await fetch(`${API_BASE_URL}/api/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    let errorMsg = 'API error';
    if (typeof body.detail === 'string') {
      errorMsg = body.detail;
    } else if (Array.isArray(body.detail)) {
      errorMsg = body.detail.map((d: any) => (typeof d === 'string' ? d : d.msg || JSON.stringify(d))).join(', ');
    } else if (typeof body.message === 'string') {
      errorMsg = body.message;
    } else if (typeof body.error === 'string') {
      errorMsg = body.error;
    } else if (response.statusText) {
      errorMsg = `${response.status} ${response.statusText}`;
    }
    throw new Error(errorMsg);
  }
  return body as T;
}
