type DataManifest = {
  version?: string;
  generated_at?: string;
};

import { API_BASE_URL, API_DATA_TOKEN } from "./constants";

const DATA_API_BASE_URL = API_BASE_URL;
const DATA_API_TOKEN = API_DATA_TOKEN;
const CACHE_PREFIX = "nba-static-data";
const VERSION_KEY = "nba-static-data-version";

const jsonCache = new Map<string, Promise<unknown>>();
let manifestVersion: string | null = null;
let manifestPromise: Promise<DataManifest | null> | null = null;

function canUsePersistentCache() {
  return (
    typeof window !== "undefined" &&
    "caches" in window &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1"
  );
}

function cacheName(version: string | null) {
  return `${CACHE_PREFIX}-${version ?? "unversioned"}`;
}

function dataHeaders(): HeadersInit | undefined {
  return DATA_API_TOKEN ? { "X-Data-Token": DATA_API_TOKEN } : undefined;
}

async function fetchCachedApi(path: string): Promise<unknown> {
  await loadManifest();

  const url = `${DATA_API_BASE_URL}${path}`;
  if (!canUsePersistentCache()) {
    const response = await fetch(url, { headers: dataHeaders() });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.detail || `Server returned ${response.status}`);
    return body;
  }

  const version = manifestVersion ?? localStorage.getItem(VERSION_KEY);
  const cache = await window.caches.open(cacheName(version));
  const request = new Request(url, { headers: dataHeaders() });
  const cached = await cache.match(request);
  if (cached) {
    return cached.json();
  }

  const response = await fetch(request);
  const body = await response.clone().json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.detail || `Server returned ${response.status}`);
  await cache.put(request, response);
  return body;
}

export async function loadPrivateApi<T>(path: string): Promise<T> {
  return (await fetchCachedApi(path)) as T;
}

export async function postPrivateApi<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${DATA_API_BASE_URL}${path}`, {
    method: "POST",
    headers: { ...dataHeaders(), "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.detail || `Server returned ${response.status}`);
  return result as T;
}

export async function loadPrivateApiFresh<T>(path: string): Promise<T> {
  const response = await fetch(`${DATA_API_BASE_URL}${path}`, {
    cache: "no-store",
    headers: dataHeaders(),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.detail || `Server returned ${response.status}`);
  return result as T;
}

function dataUrl(path: string) {
  const filename = path.replace(/^\/data\//, "");
  return `${DATA_API_BASE_URL}/frontend-data/${encodeURIComponent(filename)}`;
}

function staticDataUrl(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}

async function pruneOldCaches(activeVersion: string | null) {
  if (!canUsePersistentCache() || !activeVersion) return;

  const names = await window.caches.keys();
  await Promise.all(
    names
      .filter((name) => name.startsWith(`${CACHE_PREFIX}-`) && name !== cacheName(activeVersion))
      .map((name) => window.caches.delete(name))
  );
}

async function loadManifest(): Promise<DataManifest | null> {
  if (!manifestPromise) {
    const staticManifest = fetch(staticDataUrl("/data/manifest.json"), { cache: "no-cache" })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);

    manifestPromise = staticManifest.then((manifest) => {
      if (manifest) return manifest;
      return fetch(`${DATA_API_BASE_URL}/frontend-data/manifest`, {
        cache: "no-cache",
        headers: dataHeaders(),
      })
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null);
    });
  }

  const manifest = await manifestPromise;
  const nextVersion = manifest?.version ?? manifest?.generated_at ?? null;
  const storedVersion = localStorage.getItem(VERSION_KEY);
  if (nextVersion && (manifestVersion || storedVersion) && nextVersion !== (manifestVersion ?? storedVersion)) {
    jsonCache.clear();
  }
  if (nextVersion) {
    manifestVersion = nextVersion;
    localStorage.setItem(VERSION_KEY, nextVersion);
    pruneOldCaches(nextVersion).catch(() => {});
  }

  return manifest;
}

async function fetchJsonWithPersistentCache(path: string): Promise<unknown> {
  const version = manifestVersion ?? localStorage.getItem(VERSION_KEY);
  const url = dataUrl(path);
  const staticUrl = staticDataUrl(path);

  const tryStaticFetch = async () => {
    const response = await fetch(staticUrl, { cache: "no-cache" });
    if (!response.ok) return null;
    return response.json().catch(() => null);
  };

  if (!canUsePersistentCache()) {
    const staticBody = await tryStaticFetch();
    if (staticBody !== null) return staticBody;

    const response = await fetch(url, { headers: dataHeaders() });
    if (!response.ok) throw new Error(path.split("/").pop() ?? path);
    return response.json();
  }

  const cache = await window.caches.open(cacheName(version));
  const staticRequest = new Request(staticUrl);
  const cachedStatic = await cache.match(staticRequest);
  if (cachedStatic) {
    return cachedStatic.json();
  }

  const staticResponse = await fetch(staticRequest);
  if (staticResponse.ok) {
    const staticBody = await staticResponse.clone().json().catch(() => null);
    if (staticBody !== null) {
      await cache.put(staticRequest, staticResponse);
      return staticBody;
    }
  }

  const request = new Request(url, { headers: dataHeaders() });
  const cached = await cache.match(request);
  if (cached) {
    return cached.json();
  }

  const response = await fetch(request);
  if (!response.ok) throw new Error(path.split("/").pop() ?? path);
  await cache.put(request, response.clone());
  return response.json();
}

export async function loadJson<T>(path: string, fallback?: T): Promise<T> {
  await loadManifest();

  if (!jsonCache.has(path)) {
    jsonCache.set(path, fetchJsonWithPersistentCache(path));
  }

  try {
    return (await jsonCache.get(path)) as T;
  } catch (error) {
    if (fallback !== undefined) {
      return fallback;
    }
    throw error;
  }
}

export function clearDataCache() {
  manifestPromise = null;
  manifestVersion = null;
  jsonCache.clear();
  localStorage.removeItem(VERSION_KEY);
  if (canUsePersistentCache()) {
    window.caches
      .keys()
      .then((names) =>
        Promise.all(
          names.filter((name) => name.startsWith(`${CACHE_PREFIX}-`)).map((name) => window.caches.delete(name))
        )
      )
      .catch(() => {});
  }
}

export async function prefetchManifestFiles(): Promise<void> {
  try {
    const manifest = await loadManifest();
    if (!manifest) return;

    const files = (manifest as any)?.files || {};

    // Only prefetch files smaller than 1.5MB to prevent blocking the main thread
    const sortedFiles = Object.keys(files)
      .filter((name) => (files[name].size_bytes || 0) < 1.5 * 1024 * 1024)
      .sort((a, b) => {
        return (files[a].size_bytes || 0) - (files[b].size_bytes || 0);
      });

    console.log(`Starting background prefetch of ${sortedFiles.length} lightweight files...`);
    
    // Fetch files sequentially in the background
    for (const filename of sortedFiles) {
      const path = `/data/${filename}`;
      try {
        await loadJson(path);
      } catch (err) {
        console.warn(`Prefetch failed for ${filename}:`, err);
      }
    }
    console.log("Background prefetch completed successfully.");
  } catch (error) {
    console.error("Prefetching failed:", error);
  }
}
