import { useEffect, useState } from "react";
import { loadPrivateApiFresh } from "./dataCache";

// The API pulls the cloud morning sync and rebuilds the frontend store in the background
// (src/api/services/data_sync.py). Pages reload their data when `storeBuiltAt` changes.

interface DataSyncStatus {
  enabled: boolean;
  running: boolean;
  store_built_at: string | null;
}

const RUNNING_POLL_MS = 4_000;
const IDLE_POLL_MS = 60_000;

export function useDataSync(season: string | null | undefined) {
  const [state, setState] = useState<{ running: boolean; storeBuiltAt: string | null }>({
    running: false,
    storeBuiltAt: null,
  });

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const query = season ? `?season=${encodeURIComponent(season)}` : "";
    const poll = async () => {
      let running = false;
      try {
        const s = await loadPrivateApiFresh<DataSyncStatus>(`/frontend-data-api/data-sync${query}`);
        running = Boolean(s.running);
        if (!cancelled) {
          setState((prev) =>
            prev.running === running && prev.storeBuiltAt === s.store_built_at
              ? prev
              : { running, storeBuiltAt: s.store_built_at }
          );
        }
      } catch {
        // status is a convenience; the page keeps working without it
      }
      if (!cancelled) timer = window.setTimeout(poll, running ? RUNNING_POLL_MS : IDLE_POLL_MS);
    };
    poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [season]);

  return state;
}
