import { API_BASE_URL, API_DATA_TOKEN } from "./constants";

// All frontend data comes from the ML service (`/frontend-data-api/*`), which serves
// the SQLite store built by scripts/build_frontend_store.py.

const apiCache = new Map<string, Promise<unknown>>();

function dataHeaders(): HeadersInit | undefined {
  return API_DATA_TOKEN ? { "X-Data-Token": API_DATA_TOKEN } : undefined;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);
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

/** GET bypassing every cache, for data that changes while the page is open. */
export async function loadPrivateApiFresh<T>(path: string): Promise<T> {
  return requestJson<T>(path, { cache: "no-store", headers: dataHeaders() });
}

export async function postPrivateApi<T>(path: string, body?: unknown): Promise<T> {
  return requestJson<T>(path, {
    method: "POST",
    headers: { ...dataHeaders(), "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
