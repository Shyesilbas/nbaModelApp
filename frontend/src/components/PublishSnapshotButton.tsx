import { useCallback, useEffect, useRef, useState } from "react";
import { CloudUpload } from "lucide-react";
import { Badge, Button } from "./common";
import { loadPrivateApiFresh, postPrivateApi } from "../lib/dataCache";

type PublishStatus = {
  status: "idle" | "running" | "done" | "failed";
  started_at: string | null;
  finished_at: string | null;
  message: string | null;
  error: string | null;
};

const API = "/frontend-data-api/snapshot-publish";
const POLL_MS = 2000;

/** Sends the fetched game data to GitHub so the cloud snapshot predicts from it. */
export default function PublishSnapshotButton() {
  const [state, setState] = useState<PublishStatus | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const poll = useCallback(async () => {
    try {
      const next = await loadPrivateApiFresh<PublishStatus>(API);
      setState(next);
      setRequestError(null);
      if (next.status === "running") timer.current = window.setTimeout(poll, POLL_MS);
    } catch (e) {
      setRequestError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    poll();
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [poll]);

  const start = async () => {
    setRequestError(null);
    try {
      setState(await postPrivateApi<PublishStatus>(API));
      timer.current = window.setTimeout(poll, POLL_MS);
    } catch (e) {
      setRequestError((e as Error).message);
    }
  };

  const running = state?.status === "running";
  const failure = requestError ?? (state?.status === "failed" ? state.error : null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        isLoading={running}
        leftIcon={<CloudUpload size={16} strokeWidth={1.5} />}
        onClick={start}
      >
        {running ? "Publishing" : "Publish data to cloud"}
      </Button>
      {state?.status === "done" && state.message && (
        <Badge variant="success" size="sm">{state.message}</Badge>
      )}
      {failure && (
        <>
          <Badge variant="error" size="sm">{failure}</Badge>
          <Button variant="ghost" size="sm" onClick={start}>Retry</Button>
        </>
      )}
    </div>
  );
}
