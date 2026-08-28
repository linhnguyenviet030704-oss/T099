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

export type StreamStatusPayload = {
  step: string;
  label: string;
  progress?: number;
};

export type StreamTokenPayload = {
  delta: string;
};

export type StreamCompletePayload<T = any> = {
  response: string;
  session_id?: string;
  jobs?: any[];
  candidates?: any[];
  [key: string]: any;
};

export type StreamErrorPayload = {
  error: string;
  code?: string;
};

export type StreamEvent<T = any> =
  | { event: 'status'; data: StreamStatusPayload }
  | { event: 'token'; data: StreamTokenPayload }
  | { event: 'complete'; data: StreamCompletePayload<T> }
  | { event: 'error'; data: StreamErrorPayload };

/**
 * Gửi yêu cầu HTTP và đọc luồng Server-Sent Events (SSE) theo thời gian thực.
 */
export async function apiStream<T = any>(
  path: string,
  accessToken: string,
  bodyData: any,
  onEvent: (event: StreamEvent<T>) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (!API_BASE_URL) {
    throw new Error('VITE_API_BASE_URL chưa được cấu hình.');
  }

  const response = await fetch(`${API_BASE_URL}/api/v1${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(bodyData),
    signal,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
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

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Không thể khởi tạo luồng đọc dữ liệu.');
  }

  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      let currentEvent = 'message';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          currentEvent = 'message';
          continue;
        }

        if (trimmed.startsWith('event:')) {
          currentEvent = trimmed.slice(6).trim();
        } else if (trimmed.startsWith('data:')) {
          const rawData = trimmed.slice(5).trim();
          try {
            const parsed = JSON.parse(rawData);
            onEvent({ event: currentEvent as any, data: parsed });
          } catch {
            // Dữ liệu không ở dạng JSON hợp lệ
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

