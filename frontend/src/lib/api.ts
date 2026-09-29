import { registerClientEventId } from './clientEvents';

/**
 * Absolute API origin, set at build time via VITE_API_URL (e.g. on Render the
 * backend lives on its own service). Empty in dev → same-origin requests that
 * the Vite dev proxy forwards to the backend.
 */
export const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public issues?: { path: string; message: string }[]
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') {
    // Echoed on realtime broadcasts so this tab can ignore its own events.
    headers['x-client-event-id'] = registerClientEventId();
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api${path}`, {
      method,
      credentials: 'include',
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Is the backend running?');
  }

  if (response.status === 204) return undefined as T;

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const err = data?.error;
    // Zod failures carry a generic message plus per-field issues — surface the
    // first one so toasts read like "Password must be at least 8 characters".
    const message =
      err?.issues?.[0]?.message ?? err?.message ?? `Request failed (${response.status})`;
    throw new ApiError(response.status, err?.code ?? 'UNKNOWN', message, err?.issues);
  }

  return data as T;
}
