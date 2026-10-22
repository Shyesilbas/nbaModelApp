import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Stethoscope } from "lucide-react";
import { Badge, Button, Card, EmptyState, InlineError, Input, Select, Skeleton } from "./common";
import TeamLogo from "./TeamLogo";
import { loadPrivateApiFresh } from "../lib/dataCache";
import { CURRENT_SEASON } from "../lib/constants";

type InjuredPlayer = {
  team: string;
  player_name: string;
  status: string;
  reason: string;
  matchup: string;
  since: string;
  games_missed: number;
  minutes: number | null;
  rotation: boolean;
};

type Change = { team: string; player_name: string; matchup: string; from: string | null; to: string | null; since_report_et: string };

type Returned = {
  team: string;
  player_name: string;
  listed_from: string;
  listed_to: string;
  returned_on: string;
  games_missed: number;
};

type Payload = {
  season: string;
  date: string;
  live: boolean;
  published_et: string | null;
  not_filed: string[];
  players: InjuredPlayer[];
  changes: Change[];
  recent_returns: Returned[];
  stored_days: string[];
};

const STATUS_VARIANT: Record<string, "error" | "warning" | "neutral" | "success"> = {
  Out: "error",
  Doubtful: "warning",
  Questionable: "warning",
  Probable: "neutral",
  Available: "success",
};

const todayEt = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card padding="sm">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold text-text-primary">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-text-secondary">{hint}</p>}
    </Card>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <Badge variant="neutral" size="sm">Not listed</Badge>;
  return <Badge variant={STATUS_VARIANT[status] ?? "neutral"} size="sm">{status}</Badge>;
}

export default function InjuriesTab() {
  const [date, setDate] = useState<string>(todayEt());
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState("");
  const [query, setQuery] = useState("");
  const [rotationOnly, setRotationOnly] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    loadPrivateApiFresh<Payload>(`/frontend-data-api/injuries?season=${CURRENT_SEASON}&date=${date}`)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [date]);

  useEffect(load, [load]);

  const days = useMemo(() => {
    const set = new Set([...(data?.stored_days ?? []), todayEt()]);
    return Array.from(set).sort();
  }, [data]);
  const dayIndex = days.indexOf(date);

  const players = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.players ?? []).filter(
      (p) =>
        (!team || p.team === team) &&
        (!rotationOnly || p.rotation) &&
        (!q || p.player_name.toLowerCase().includes(q))
    );
  }, [data, team, query, rotationOnly]);

  const teams = useMemo(() => Array.from(new Set((data?.players ?? []).map((p) => p.team))).sort(), [data]);

  if (error) {
    return <InlineError title="Failed to load injuries" message={error} onRetry={load} />;
  }

  const all = data?.players ?? [];
  const out = all.filter((p) => p.status === "Out").length;
  const uncertain = all.filter((p) => p.status === "Questionable" || p.status === "Doubtful").length;
  const rotationHit = all.filter((p) => p.rotation && p.status !== "Probable" && p.status !== "Available").length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-text-primary">Injuries</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Official NBA injury report. Today is read live; earlier days are the last report of that day, stored as the
          season goes. Predictions apply this report automatically.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          aria-label="Previous day"
          disabled={dayIndex <= 0}
          onClick={() => setDate(days[dayIndex - 1])}
        >
          <ChevronLeft size={16} strokeWidth={1.5} />
        </Button>
        <Select aria-label="Day" value={date} onChange={(e) => setDate(e.target.value)}>
          {[...days].reverse().map((d) => (
            <option key={d} value={d}>{d}{d === todayEt() ? " (today)" : ""}</option>
          ))}
        </Select>
        <Button
          variant="secondary"
          size="sm"
          aria-label="Next day"
          disabled={dayIndex < 0 || dayIndex >= days.length - 1}
          onClick={() => setDate(days[dayIndex + 1])}
        >
          <ChevronRight size={16} strokeWidth={1.5} />
        </Button>
        {data?.published_et && <span className="text-xs text-text-secondary">Report {data.published_et}</span>}
      </div>

      {loading || !data ? (
        <div className="space-y-4" aria-busy="true">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={84} />)}
          </div>
          <Skeleton height={320} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Players listed" value={`${all.length}`} />
            <Stat label="Out" value={`${out}`} />
            <Stat label="Questionable / doubtful" value={`${uncertain}`} />
            <Stat label="Rotation players affected" value={`${rotationHit}`} hint="15+ minutes over the last 10 games" />
          </div>

          {data.not_filed.length > 0 && (
            <Card padding="md">
              <p className="text-xs text-text-secondary">
                Not filed yet: {data.not_filed.join(", ")}. The model assumes these teams are as they were in their last game.
              </p>
            </Card>
          )}

          {data.changes.length > 0 && (
            <Card padding="none" className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="border-b border-border-light px-4 py-3 text-left text-sm font-semibold text-text-primary">
                  Changes today (since the {data.changes[0].since_report_et} report)
                </caption>
                <tbody>
                  {data.changes.map((c) => (
                    <tr key={`${c.team}-${c.player_name}`} className="border-t border-border-light first:border-t-0">
                      <td className="whitespace-nowrap px-4 py-2 text-text-primary">{c.player_name}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-text-secondary">{c.matchup}</td>
                      <td className="whitespace-nowrap px-4 py-2">
                        <span className="inline-flex items-center gap-2">
                          <StatusBadge status={c.from} />
                          <span className="text-text-muted">to</span>
                          <StatusBadge status={c.to} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Select aria-label="Team" value={team} onChange={(e) => setTeam(e.target.value)}>
              <option value="">All teams</option>
              {teams.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
            <Input
              aria-label="Search player"
              placeholder="Search player"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Button
              variant={rotationOnly ? "primary" : "secondary"}
              size="sm"
              aria-pressed={rotationOnly}
              onClick={() => setRotationOnly((v) => !v)}
            >
              Rotation only
            </Button>
          </div>

          {all.length === 0 ? (
            <EmptyState
              icon={<Stethoscope size={32} strokeWidth={1.5} />}
              title={data.live ? "No report for this day yet" : "Nothing stored for this day"}
              description={
                data.live
                  ? "Teams file their reports the day before and keep updating them until tip-off."
                  : "This day was synced with nobody listed, or it was played before the history started."
              }
            />
          ) : (
            <Card padding="none" className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="border-b border-border-light px-4 py-3 text-left text-sm font-semibold text-text-primary">
                  {date} ({players.length} of {all.length} players)
                </caption>
                <thead className="bg-background-tertiary text-xs text-text-muted">
                  <tr>
                    <th className="px-4 py-2 font-medium">Player</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Listed since</th>
                    <th className="px-4 py-2 font-medium">Games missed</th>
                    <th className="px-4 py-2 font-medium">Minutes</th>
                    <th className="px-4 py-2 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((p) => (
                    <tr key={`${p.team}-${p.player_name}`} className="border-t border-border-light align-top">
                      <td className="whitespace-nowrap px-4 py-2">
                        <span className="inline-flex items-center gap-2">
                          <TeamLogo abbr={p.team} size={18} />
                          <span className="text-text-primary">{p.player_name}</span>
                          {p.rotation && <Badge variant="info" size="sm">Rotation</Badge>}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2"><StatusBadge status={p.status} /></td>
                      <td className="whitespace-nowrap px-4 py-2 text-text-secondary">{p.since}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-text-secondary">{p.games_missed}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-text-secondary">{p.minutes ?? "-"}</td>
                      <td className="px-4 py-2 text-text-secondary">{p.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {data.recent_returns.length > 0 && (
            <Card padding="none" className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="border-b border-border-light px-4 py-3 text-left text-sm font-semibold text-text-primary">
                  Returned in the last 7 days
                </caption>
                <thead className="bg-background-tertiary text-xs text-text-muted">
                  <tr>
                    <th className="px-4 py-2 font-medium">Player</th>
                    <th className="px-4 py-2 font-medium">Listed</th>
                    <th className="px-4 py-2 font-medium">Returned</th>
                    <th className="px-4 py-2 font-medium">Games missed</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_returns.map((r) => (
                    <tr key={`${r.team}-${r.player_name}`} className="border-t border-border-light">
                      <td className="whitespace-nowrap px-4 py-2">
                        <span className="inline-flex items-center gap-2">
                          <TeamLogo abbr={r.team} size={18} />
                          <span className="text-text-primary">{r.player_name}</span>
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-text-secondary">{r.listed_from} to {r.listed_to}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-text-primary">{r.returned_on}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-text-secondary">{r.games_missed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
