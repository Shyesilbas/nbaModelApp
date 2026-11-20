import { API_BASE_URL, API_DATA_TOKEN } from "./constants";

// All frontend data comes from the ML service (`/frontend-data-api/*`), which serves
// the SQLite store built by scripts/build_frontend_store.py.

const apiCache = new Map<string, Promise<unknown>>();

function dataHeaders(): HeadersInit | undefined {
  return API_DATA_TOKEN ? { "X-Data-Token": API_DATA_TOKEN } : undefined;
}

// The API refuses connections for ~15 s after a cold start while it warms its caches.
// A network-level failure (no HTTP response at all) is retried instead of surfaced.
const CONNECT_RETRY_DELAYS_MS = [500, 1000, 1500, 2000, 3000, 3000, 4000, 4000, 5000, 5000, 5000];

async function fetchWithStartupRetry(url: string, init?: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fetch(url, init);
    } catch (error) {
      if (init?.signal?.aborted || attempt >= CONNECT_RETRY_DELAYS_MS.length) throw error;
      await new Promise((resolve) => setTimeout(resolve, CONNECT_RETRY_DELAYS_MS[attempt]));
    }
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithStartupRetry(`${API_BASE_URL}${path}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.detail || `Server returned ${response.status}`);
  return body as T;
}

/** GET once per page load; concurrent and later callers share the response. */
export async function loadPrivateApi<T>(path: string): Promise<T> {
  if (!apiCache.has(path)) {
    const request = requestJson<T>(path, { headers: dataHeaders() }).catch((error) => {
      apiCache.delete(path); // allow a later retry
      throw error;
    });
    apiCache.set(path, request);
  }
  return (await apiCache.get(path)) as T;
}

/**
 * GET that always asks the server, for data that changes while the page is open. The server
 * answers 304 when the ETag still matches, so an unchanged document is not downloaded again.
 */
export async function loadPrivateApiFresh<T>(path: string): Promise<T> {
  return requestJson<T>(path, { cache: "no-cache", headers: dataHeaders() });
}

export async function postPrivateApi<T>(path: string, body?: unknown): Promise<T> {
  return requestJson<T>(path, {
    method: "POST",
    headers: { ...dataHeaders(), "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
