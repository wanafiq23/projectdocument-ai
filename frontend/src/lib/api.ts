export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); this.name = 'ApiError'; }
}

async function request(path: string, options: RequestInit = {}): Promise<Response> {
  let response: Response;
  const headers = new Headers(options.headers);
  headers.set('X-ProjectDocumentAI-Request', '1');
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  try {
    response = await fetch(`/api${path}`, {
      ...options, credentials: 'same-origin', signal: options.signal || AbortSignal.timeout(path.startsWith('/ai/') || path.endsWith('/index') || options.body instanceof FormData ? 240000 : 15000), headers,
    });
  } catch { throw new ApiError('Cannot reach the local API. Start the backend and try again.', 0); }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    if (response.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('projectdocumentai:session-expired'));
    const detail = body?.detail;
    const message = typeof detail === 'string' ? detail : Array.isArray(detail)
      ? detail.map((item: { loc?: string[]; msg?: string }) => `${item.loc?.at(-1) || 'Input'}: ${item.msg || 'Invalid value'}`).join('. ')
      : 'The local API is unavailable. Start the backend and try again.';
    throw new ApiError(message, response.status);
  }
  return response;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await request(path, options);
  return response.status === 204 ? undefined as T : await response.json() as T;
}

export async function apiBlob(path: string): Promise<Blob> {
  return (await request(path)).blob();
}

export const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';
