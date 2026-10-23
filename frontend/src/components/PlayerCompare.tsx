import React, { useState, useEffect, useMemo } from "react";
import { Search, Check } from "lucide-react";
import { loadPrivateApi } from "../lib/dataCache";
import { CURRENT_SEASON } from "../lib/constants";
import PlayerPhoto from "./PlayerPhoto";

interface PlayerProfile {
  PLAYER_ID: number;
  PLAYER_NAME: string;
  CURRENT_TEAM_ABBREVIATION?: string;
  POSITION_GROUP?: string;
  HEIGHT?: string;
  WEIGHT?: string;
  COLLEGE?: string;
}

interface SeasonAverages {
  games_played: number;
  games_total?: number;
  MIN: number | null;
  PTS: number | null;
  REB: number | null;
  AST: number | null;
  STL: number | null;
  BLK: number | null;
  TOV: number | null;
  PLUS_MINUS: number | null;
  FG_PCT: number | null;
  FG3_PCT: number | null;
  FT_PCT: number | null;
}

interface PlayerCompareProps {
  initialP1Id?: number | null;
  initialP2Id?: number | null;
  onSelectPlayerProfile?: (playerId: number) => void;
  onSelectGame?: (gameId: string) => void;
}

export const PlayerCompare: React.FC<PlayerCompareProps> = ({
  initialP1Id,
  initialP2Id,
  onSelectPlayerProfile,
}) => {
  const [profiles, setProfiles] = useState<PlayerProfile[]>([]);
  const [averagesMap, setAveragesMap] = useState<Record<string, Record<string, SeasonAverages>>>({});
  const [seasons, setSeasons] = useState<string[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>(CURRENT_SEASON);

  const [p1Id, setP1Id] = useState<number | null>(initialP1Id || null);
  const [p2Id, setP2Id] = useState<number | null>(initialP2Id || null);

  const [p1Search, setP1Search] = useState("");
  const [p2Search, setP2Search] = useState("");
  const [p1SearchOpen, setP1SearchOpen] = useState(false);
  const [p2SearchOpen, setP2SearchOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      loadPrivateApi<PlayerProfile[]>("/frontend-data-api/player-profiles"),
      loadPrivateApi<Record<string, Record<string, SeasonAverages>>>("/frontend-data-api/player-season-averages"),
      loadPrivateApi<string[]>("/frontend-data-api/seasons"),
    ])
      .then(([prof, avg, seas]) => {
        setProfiles(prof || []);
        setAveragesMap(avg || {});
        if (seas && seas.length > 0) {
          setSeasons(seas);
          if (seas.includes(CURRENT_SEASON)) {
            setSelectedSeason(CURRENT_SEASON);
          } else {
            setSelectedSeason(seas[seas.length - 1]);
          }
        }
      })
      .catch(() => {});
  }, []);

  // Set defaults if not provided
  useEffect(() => {
    if (profiles.length > 0) {
      if (!p1Id) {
        // e.g. Luka Doncic (1629029) or first player
        const luka = profiles.find((p) => p.PLAYER_NAME.includes("Luka"));
        setP1Id(luka ? luka.PLAYER_ID : profiles[0].PLAYER_ID);
      }
      if (!p2Id) {
        // e.g. Shai Gilgeous-Alexander (1628983) or second player
        const shai = profiles.find((p) => p.PLAYER_NAME.includes("Gilgeous"));
        setP2Id(shai ? shai.PLAYER_ID : profiles[1]?.PLAYER_ID || profiles[0].PLAYER_ID);
      }
    }
  }, [profiles]);

  const p1 = useMemo(() => profiles.find((p) => p.PLAYER_ID === p1Id), [profiles, p1Id]);
  const p2 = useMemo(() => profiles.find((p) => p.PLAYER_ID === p2Id), [profiles, p2Id]);

  const p1Stats = useMemo(() => {
    if (!p1Id || !averagesMap[String(p1Id)]) return null;
    return averagesMap[String(p1Id)][selectedSeason] || null;
  }, [averagesMap, p1Id, selectedSeason]);

  const p2Stats = useMemo(() => {
    if (!p2Id || !averagesMap[String(p2Id)]) return null;
    return averagesMap[String(p2Id)][selectedSeason] || null;
  }, [averagesMap, p2Id, selectedSeason]);

  const p1Filtered = useMemo(() => {
    const q = p1Search.trim().toLowerCase();
    if (!q) return profiles.slice(0, 10);
    return profiles.filter((p) => p.PLAYER_NAME.toLowerCase().includes(q)).slice(0, 15);
  }, [profiles, p1Search]);

  const p2Filtered = useMemo(() => {
    const q = p2Search.trim().toLowerCase();
    if (!q) return profiles.slice(0, 10);
    return profiles.filter((p) => p.PLAYER_NAME.toLowerCase().includes(q)).slice(0, 15);
  }, [profiles, p2Search]);

  const STAT_METRICS = [
    { key: "PTS", label: "Points (PPG)", higherIsBetter: true, format: (v: number) => v.toFixed(1) },
    { key: "REB", label: "Rebounds (RPG)", higherIsBetter: true, format: (v: number) => v.toFixed(1) },
    { key: "AST", label: "Assists (APG)", higherIsBetter: true, format: (v: number) => v.toFixed(1) },
    { key: "MIN", label: "Minutes (MPG)", higherIsBetter: true, format: (v: number) => v.toFixed(1) },
    { key: "STL", label: "Steals (SPG)", higherIsBetter: true, format: (v: number) => v.toFixed(1) },
    { key: "BLK", label: "Blocks (BPG)", higherIsBetter: true, format: (v: number) => v.toFixed(1) },
    { key: "TOV", label: "Turnovers (TOPG)", higherIsBetter: false, format: (v: number) => v.toFixed(1) },
    { key: "PLUS_MINUS", label: "+/- Per Game", higherIsBetter: true, format: (v: number) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1)) },
    { key: "FG_PCT", label: "Field Goal %", higherIsBetter: true, format: (v: number) => `${(v * 100).toFixed(1)}%` },
    { key: "FG3_PCT", label: "3-Point %", higherIsBetter: true, format: (v: number) => `${(v * 100).toFixed(1)}%` },
    { key: "FT_PCT", label: "Free Throw %", higherIsBetter: true, format: (v: number) => `${(v * 100).toFixed(1)}%` },
  ] as const;

  return (
    <div className="space-y-6">
      {/* Header with Season Selector */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Player Head-to-Head Comparison</h1>
          <p className="text-xs text-text-secondary">
            Official regular season & playoff statistical matchup (preseason games excluded)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-text-secondary">Season:</label>
          <select
            value={selectedSeason}
            onChange={(e) => setSelectedSeason(e.target.value)}
            className="rounded border border-border bg-background-primary px-3 py-1.5 text-xs font-medium text-text-primary focus:outline-none"
          >
            {seasons.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Players Selection Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Player 1 Card */}
        <div className="surface-card relative flex flex-col justify-between">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              {p1 ? (
                <PlayerPhoto playerId={p1.PLAYER_ID} name={p1.PLAYER_NAME} size={56} />
              ) : null}
              <div>
                <h3 className="text-base font-semibold text-text-primary">
                  {p1?.PLAYER_NAME || "Select Player 1"}
                </h3>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-text-secondary">
                  <span>{p1?.CURRENT_TEAM_ABBREVIATION || "NBA"}</span>
                  <span>·</span>
                  <span>{p1?.POSITION_GROUP || "Player"}</span>
                  {p1?.HEIGHT && (
                    <>
                      <span>·</span>
                      <span>{p1.HEIGHT}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={() => setP1SearchOpen(!p1SearchOpen)}
              className="inline-flex items-center gap-1.5 rounded border border-border bg-background-secondary px-2.5 py-1 text-xs font-medium text-text-primary hover:bg-background-tertiary"
            >
              <Search size={13} strokeWidth={1.5} />
              <span>Change</span>
            </button>
          </div>

          {/* Search Dropdown for P1 */}
          {p1SearchOpen && (
            <div className="absolute left-0 right-0 top-16 z-20 m-2 rounded border border-border bg-background-primary p-2 shadow-lg">
              <input
                type="text"
                value={p1Search}
                onChange={(e) => setP1Search(e.target.value)}
                placeholder="Search player..."
                autoFocus
                className="w-full rounded border border-border bg-background-secondary px-2.5 py-1.5 text-xs text-text-primary focus:outline-none"
              />
              <div className="mt-2 max-h-48 overflow-y-auto">
                {p1Filtered.map((p) => (
                  <div
                    key={p.PLAYER_ID}
                    onClick={() => {
                      setP1Id(p.PLAYER_ID);
                      setP1SearchOpen(false);
                      setP1Search("");
                    }}
                    className="flex cursor-pointer items-center justify-between rounded px-2 py-1.5 text-xs hover:bg-background-tertiary"
                  >
                    <span className="font-medium text-text-primary">{p.PLAYER_NAME}</span>
                    <span className="text-text-muted">{p.CURRENT_TEAM_ABBREVIATION}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {p1 && onSelectPlayerProfile && (
            <div className="mt-4 border-t border-border pt-3">
              <button
                onClick={() => onSelectPlayerProfile(p1.PLAYER_ID)}
                className="text-xs font-medium text-primary hover:underline"
              >
                View full profile →
              </button>
            </div>
          )}
        </div>

        {/* Player 2 Card */}
        <div className="surface-card relative flex flex-col justify-between">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              {p2 ? (
                <PlayerPhoto playerId={p2.PLAYER_ID} name={p2.PLAYER_NAME} size={56} />
              ) : null}
              <div>
                <h3 className="text-base font-semibold text-text-primary">
                  {p2?.PLAYER_NAME || "Select Player 2"}
                </h3>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-text-secondary">
                  <span>{p2?.CURRENT_TEAM_ABBREVIATION || "NBA"}</span>
                  <span>·</span>
                  <span>{p2?.POSITION_GROUP || "Player"}</span>
                  {p2?.HEIGHT && (
                    <>
                      <span>·</span>
                      <span>{p2.HEIGHT}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={() => setP2SearchOpen(!p2SearchOpen)}
              className="inline-flex items-center gap-1.5 rounded border border-border bg-background-secondary px-2.5 py-1 text-xs font-medium text-text-primary hover:bg-background-tertiary"
            >
              <Search size={13} strokeWidth={1.5} />
              <span>Change</span>
            </button>
          </div>

          {/* Search Dropdown for P2 */}
          {p2SearchOpen && (
            <div className="absolute left-0 right-0 top-16 z-20 m-2 rounded border border-border bg-background-primary p-2 shadow-lg">
              <input
                type="text"
                value={p2Search}
                onChange={(e) => setP2Search(e.target.value)}
                placeholder="Search player..."
                autoFocus
                className="w-full rounded border border-border bg-background-secondary px-2.5 py-1.5 text-xs text-text-primary focus:outline-none"
              />
              <div className="mt-2 max-h-48 overflow-y-auto">
                {p2Filtered.map((p) => (
                  <div
                    key={p.PLAYER_ID}
                    onClick={() => {
                      setP2Id(p.PLAYER_ID);
                      setP2SearchOpen(false);
                      setP2Search("");
                    }}
                    className="flex cursor-pointer items-center justify-between rounded px-2 py-1.5 text-xs hover:bg-background-tertiary"
                  >
                    <span className="font-medium text-text-primary">{p.PLAYER_NAME}</span>
                    <span className="text-text-muted">{p.CURRENT_TEAM_ABBREVIATION}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {p2 && onSelectPlayerProfile && (
            <div className="mt-4 border-t border-border pt-3">
              <button
                onClick={() => onSelectPlayerProfile(p2.PLAYER_ID)}
                className="text-xs font-medium text-primary hover:underline"
              >
                View full profile →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Head-to-Head Comparison Table */}
      <div className="surface-card overflow-hidden !p-0">
        <div className="border-b border-border bg-background-secondary px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">Per Game Statistical Breakdown</h2>
          <p className="text-xs text-text-secondary">
            Highlighted indicators signify the statistical advantage for season {selectedSeason}
          </p>
        </div>

        <div className="divide-y divide-border">
          {STAT_METRICS.map((metric) => {
            const v1 = p1Stats ? (p1Stats as any)[metric.key] : null;
            const v2 = p2Stats ? (p2Stats as any)[metric.key] : null;

            let p1Wins = false;
            let p2Wins = false;

            if (v1 != null && v2 != null && v1 !== v2) {
              if (metric.higherIsBetter) {
                p1Wins = v1 > v2;
                p2Wins = v2 > v1;
              } else {
                p1Wins = v1 < v2;
                p2Wins = v2 < v1;
              }
            }

            return (
              <div
                key={metric.key}
                className="flex items-center justify-between px-4 py-3 text-sm transition-colors hover:bg-background-tertiary/40"
              >
                {/* P1 Value */}
                <div className="w-1/3 text-left">
                  {v1 != null ? (
                    <span
                      className={`font-semibold ${
                        p1Wins
                          ? "inline-flex items-center gap-1 rounded bg-status-success/10 px-2 py-0.5 text-status-success"
                          : "text-text-secondary"
                      }`}
                    >
                      {metric.format(v1)}
                      {p1Wins && <Check size={12} strokeWidth={2.5} />}
                    </span>
                  ) : (
                    <span className="text-text-muted">—</span>
                  )}
                </div>

                {/* Metric Label */}
                <div className="w-1/3 text-center">
                  <span className="text-xs font-medium uppercase tracking-wider text-text-secondary">
                    {metric.label}
                  </span>
                </div>

                {/* P2 Value */}
                <div className="w-1/3 text-right">
                  {v2 != null ? (
                    <span
                      className={`font-semibold ${
                        p2Wins
                          ? "inline-flex items-center gap-1 rounded bg-status-success/10 px-2 py-0.5 text-status-success"
                          : "text-text-secondary"
                      }`}
                    >
                      {p2Wins && <Check size={12} strokeWidth={2.5} />}
                      {metric.format(v2)}
                    </span>
                  ) : (
                    <span className="text-text-muted">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
