import { useEffect, useState } from "react";
import { CloudUpload } from "lucide-react";
import { Badge, Button } from "./common";
import { loadPrivateApiFresh, postPrivateApi } from "../lib/dataCache";
import { useLanguage } from "../context/useLanguage";

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
  const { language } = useLanguage();
  const tr = language === "tr";
  const [state, setState] = useState<PublishStatus | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadPrivateApiFresh<PublishStatus>(API)
      .then((next) => {
        if (!active) return;
        setState(next);
        setRequestError(null);
      })
      .catch((e: Error) => {
        if (active) setRequestError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);

  const running = state?.status === "running";

  useEffect(() => {
    if (!running) return;
    let active = true;
    let timerId: number | undefined;
    const tick = () => {
      timerId = window.setTimeout(async () => {
        try {
          const next = await loadPrivateApiFresh<PublishStatus>(API);
          if (!active) return;
          setState(next);
          setRequestError(null);
          if (next.status === "running") tick();
        } catch (e) {
          if (active) setRequestError((e as Error).message);
        }
      }, POLL_MS);
    };
    tick();
    return () => {
      active = false;
      if (timerId) window.clearTimeout(timerId);
    };
  }, [running]);

  const start = async () => {
    setRequestError(null);
    try {
      setState(await postPrivateApi<PublishStatus>(API));
    } catch (e) {
      setRequestError((e as Error).message);
    }
  };

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
        {running ? (tr ? "Yayınlanıyor..." : "Publishing...") : tr ? "Buluta yayınla" : "Publish data to cloud"}
      </Button>
      {state?.status === "done" && state.message && (
        <Badge variant="success" size="sm">{state.message}</Badge>
      )}
      {failure && (
        <>
          <Badge variant="error" size="sm">{failure}</Badge>
          <Button variant="ghost" size="sm" onClick={start}>{tr ? "Tekrar dene" : "Retry"}</Button>
        </>
      )}
    </div>
  );
}
