import React, { useEffect, useMemo, useState } from "react";
import PlayerPhoto from "../PlayerPhoto";
import TeamLogo from "../TeamLogo";
import { Skeleton } from "../common";
import { loadPrivateApi } from "../../lib/dataCache";
import { useLanguage } from "../../context/useLanguage";
import type { PlayerProfile, SeasonAverages } from "../player/types";

type StatKey = "PTS" | "REB" | "AST";

const STATS: { key: StatKey; tr: string; en: string }[] = [
  { key: "PTS", tr: "Sayı", en: "Points" },
  { key: "REB", tr: "Ribaund", en: "Rebounds" },
  { key: "AST", tr: "Asist", en: "Assists" },
];

const MIN_GP_RATIO = 0.7;
const TOP_N = 5;

interface SeasonLeadersCardProps {
  season: string;
  onSelectPlayer?: (playerId: number) => void;
}

export const SeasonLeadersCard: React.FC<SeasonLeadersCardProps> = ({ season, onSelectPlayer }) => {
  const { language } = useLanguage();
  const tr = language === "tr";
  const [stat, setStat] = useState<StatKey>("PTS");
  const [data, setData] = useState<{
    profiles: PlayerProfile[];
    averages: Record<string, Record<string, SeasonAverages>>;
  } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      loadPrivateApi<PlayerProfile[]>("/frontend-data-api/player-profiles"),
      loadPrivateApi<Record<string, Record<string, SeasonAverages>>>(
        "/frontend-data-api/player-season-averages"
      ),
    ])
      .then(([profiles, averages]) => {
        if (active) setData({ profiles, averages });
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const leaders = useMemo(() => {
    if (!data) return [];
    return data.profiles
      .flatMap((p) => {
        const a = data.averages[String(p.PLAYER_ID)]?.[season];
        if (!a || a.games_total <= 0 || a.games_played < Math.ceil(MIN_GP_RATIO * a.games_total)) return [];
        const value = a[stat];
        if (value == null) return [];
        return [{ p, value, team: a.teams?.[a.teams.length - 1] ?? p.CURRENT_TEAM ?? null }];
      })
      .sort((x, y) => y.value - x.value)
      .slice(0, TOP_N);
  }, [data, season, stat]);

  if (failed) return null;

  return (
    <aside
      className="rounded border border-border bg-background-primary"
      aria-label={tr ? "Sezon liderleri" : "Season leaders"}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border-light px-4 py-3">
        <h3 className="text-sm font-semibold text-text-primary">
          {tr ? "Sezon liderleri" : "Season leaders"}
        </h3>
        <span className="text-xs tabular-nums text-text-muted">{season}</span>
      </div>

      <div role="tablist" className="flex gap-4 border-b border-border-light px-4">
        {STATS.map((s) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={stat === s.key}
            onClick={() => setStat(s.key)}
            className={`-mb-px cursor-pointer border-b-2 py-2 text-xs transition-colors ${
              stat === s.key
                ? "border-primary font-semibold text-text-primary"
                : "border-transparent font-medium text-text-secondary hover:text-text-primary"
            }`}
          >
            {tr ? s.tr : s.en}
          </button>
        ))}
      </div>

      {!data ? (
        <div className="space-y-2 p-4" aria-busy="true">
          {Array.from({ length: TOP_N }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full rounded" />
          ))}
        </div>
      ) : leaders.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-text-secondary">
          {tr ? "Bu sezon için yeterli veri yok." : "Not enough data for this season."}
        </p>
      ) : (
        <ol className="divide-y divide-border-light">
          {leaders.map(({ p, value, team }, i) => (
            <li key={p.PLAYER_ID}>
              <button
                type="button"
                onClick={() => onSelectPlayer?.(p.PLAYER_ID)}
                className="flex w-full cursor-pointer items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-background-tertiary"
              >
                <span className="w-3 text-xs tabular-nums text-text-secondary">{i + 1}</span>
                <PlayerPhoto playerId={p.PLAYER_ID} name={p.PLAYER_NAME ?? ""} size={28} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
                  {p.PLAYER_NAME}
                </span>
                {team && <TeamLogo abbr={team} name={team} size={18} className="shrink-0" />}
                <span className="w-10 text-right text-sm font-semibold tabular-nums text-text-primary">
                  {value.toFixed(1)}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
};
