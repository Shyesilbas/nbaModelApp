import { useState, useEffect } from "react";
import { ArrowLeft, Star } from "lucide-react";
import TeamLogo from "./TeamLogo";
import PlayerPhoto from "./PlayerPhoto";
import { loadArchivedPlayByPlay, loadArchivedGameBoxscores } from "../lib/archiveData";
import { parseMinutes } from "./game-results/utils";

/* ── Data Interfaces ── */
interface TBS {
  GAME_ID: string;
  TEAM_ABBREVIATION: string;
  TEAM_NAME?: string;
  PTS?: number | null;
  REB?: number | null;
  AST?: number | null;
  STL?: number | null;
  BLK?: number | null;
  TOV?: number | null;
  FG_PCT?: number | null;
  FG3_PCT?: number | null;
  FT_PCT?: number | null;
  FGM?: number | null;
  FGA?: number | null;
  FG3M?: number | null;
  FG3A?: number | null;
  FTM?: number | null;
  FTA?: number | null;
}

interface PBS {
  GAME_ID: string;
  PLAYER_ID: number;
  PLAYER_NAME: string;
  TEAM_ABBREVIATION: string;
  MIN?: number | null;
  PTS?: number | null;
  REB?: number | null;
  AST?: number | null;
  STL?: number | null;
  BLK?: number | null;
  TOV?: number | null;
  FGM?: number | null;
  FGA?: number | null;
  FG_PCT?: number | null;
  FG3M?: number | null;
  FG3A?: number | null;
  FG3_PCT?: number | null;
  FTM?: number | null;
  FTA?: number | null;
  FT_PCT?: number | null;
  PLUS_MINUS?: number | null;
  START_POSITION?: string | null;
}

interface GameRow {
  GAME_ID: string;
  GAME_DATE: string;
  HOME_TEAM_ABBREVIATION: string;
  AWAY_TEAM_ABBREVIATION: string;
  HOME_TEAM_NAME?: string;
  AWAY_TEAM_NAME?: string;
  HOME_SCORE?: number | null;
  AWAY_SCORE?: number | null;
  WINNER_TEAM_ABBREVIATION?: string | null;
  SEASON?: string;
  SEASON_TYPE?: string | null;
  IS_PLAYOFF?: boolean | number;
  MATCHUP?: string;
  WL?: string | null;
}

interface GameDetailPanelProps {
  game: GameRow;
  season: string;
  highlightPlayerId?: number;
  onBack: () => void;
}

/* ── Helpers ── */
const normId = (id: string | number): string =>
  String(parseInt(String(id), 10)).padStart(10, "0");

const fmtN = (v: number | null | undefined, dec = 0) =>
  v != null ? v.toFixed(dec) : "—";

const fmtPct = (v: number | null | undefined) =>
  v != null ? `${(v * 100).toFixed(1)}%` : "—";

const fmtDate = (d: string | null) => {
  if (!d) return "";
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const pmClass = (pm: number | null | undefined) => {
  if (pm == null) return "text-text-muted";
  if (pm > 0) return "text-status-success font-medium";
  if (pm < 0) return "text-status-error font-medium";
  return "text-text-secondary";
};

/* ── Player list for a team ── */
function PlayerTable({
  players,
  highlightId,
}: {
  players: PBS[];
  highlightId?: number;
}) {
  const sorted = [...players].sort((a, b) => {
    const minA = parseMinutes(a.MIN);
    const minB = parseMinutes(b.MIN);
    if (minB !== minA) return minB - minA;
    const ptsA = Number(a.PTS) || 0;
    const ptsB = Number(b.PTS) || 0;
    if (ptsB !== ptsA) return ptsB - ptsA;
    return (a.PLAYER_NAME || "").localeCompare(b.PLAYER_NAME || "");
  });

  return (
    <div className="overflow-x-auto rounded border border-border bg-background-primary">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-background-tertiary">
            <th className="sticky left-0 bg-background-tertiary px-3 py-2 text-left text-xs font-medium text-text-secondary min-w-[160px]">Player</th>
            <th className="px-2 py-2 text-right text-xs font-medium text-text-secondary">MIN</th>
            <th className="px-2 py-2 text-right text-xs font-medium text-text-secondary">PTS</th>
            <th className="px-2 py-2 text-right text-xs font-medium text-text-secondary">REB</th>
            <th className="px-2 py-2 text-right text-xs font-medium text-text-secondary">AST</th>
            <th className="px-2 py-2 text-right text-xs font-medium text-text-secondary">STL</th>
            <th className="px-2 py-2 text-right text-xs font-medium text-text-secondary">BLK</th>
            <th className="px-2 py-2 text-right text-xs font-medium text-text-secondary">TOV</th>
            <th className="px-2 py-2 text-right text-xs font-medium text-text-secondary">FG%</th>
            <th className="px-2 py-2 text-right text-xs font-medium text-text-secondary">3P%</th>
            <th className="px-2 py-2 text-right text-xs font-medium text-text-secondary">FT%</th>
            <th className="px-2 py-2 text-right text-xs font-medium text-text-secondary">+/-</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-light">
          {sorted.map((p) => {
            const pid = p.PLAYER_ID != null ? Number(p.PLAYER_ID) : null;
            const isHighlight = highlightId != null && pid === highlightId;

            return (
              <tr
                key={p.PLAYER_ID}
                className={`transition-colors hover:bg-background-tertiary ${
                  isHighlight ? "bg-background-tertiary" : ""
                }`}
              >
                <td className="sticky left-0 bg-background-primary px-3 py-2 transition-colors">
                  <div className="flex items-center gap-2">
                    <PlayerPhoto playerId={p.PLAYER_ID} name={p.PLAYER_NAME} size={28} />
                    <div className="min-w-0">
                      <p className={`truncate text-xs ${isHighlight ? "font-semibold text-text-primary" : "font-medium text-text-primary"}`}>
                        {p.PLAYER_NAME}
                        {isHighlight && <Star size={11} className="inline ml-1 mb-0.5 text-text-primary" />}
                      </p>
                      <p className="text-xs text-text-muted">{p.START_POSITION || "Bench"}</p>
                    </div>
                  </div>
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-xs text-text-muted">{p.MIN != null ? Math.round(p.MIN) : "—"}</td>
                <td className="px-2 py-2 text-right font-semibold tabular-nums text-xs text-text-primary">{fmtN(p.PTS)}</td>
                <td className="px-2 py-2 text-right tabular-nums text-xs text-text-secondary">{fmtN(p.REB)}</td>
                <td className="px-2 py-2 text-right tabular-nums text-xs text-text-secondary">{fmtN(p.AST)}</td>
                <td className="px-2 py-2 text-right tabular-nums text-xs text-text-secondary">{fmtN(p.STL)}</td>
                <td className="px-2 py-2 text-right tabular-nums text-xs text-text-secondary">{fmtN(p.BLK)}</td>
                <td className="px-2 py-2 text-right tabular-nums text-xs text-text-secondary">{fmtN(p.TOV)}</td>
                <td className="px-2 py-2 text-right tabular-nums text-xs text-text-secondary">{fmtPct(p.FG_PCT)}</td>
                <td className="px-2 py-2 text-right tabular-nums text-xs text-text-secondary">{fmtPct(p.FG3_PCT)}</td>
                <td className="px-2 py-2 text-right tabular-nums text-xs text-text-secondary">{fmtPct(p.FT_PCT)}</td>
                <td className={`px-2 py-2 text-right tabular-nums text-xs ${pmClass(p.PLUS_MINUS)}`}>
                  {p.PLUS_MINUS != null ? (p.PLUS_MINUS > 0 ? `+${p.PLUS_MINUS}` : p.PLUS_MINUS) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── Team stat chips ── */
function TeamTotals({ tbs, abbr, name, score, won }: {
  tbs: TBS | null;
  abbr: string | null;
  name?: string | null;
  score?: number | null;
  won: boolean;
}) {
  const stats = [
    { label: "PTS", value: score != null ? String(score) : (tbs?.PTS != null ? fmtN(tbs.PTS) : "—") },
    { label: "REB", value: fmtN(tbs?.REB) },
    { label: "AST", value: fmtN(tbs?.AST) },
    { label: "STL", value: fmtN(tbs?.STL) },
    { label: "BLK", value: fmtN(tbs?.BLK) },
    { label: "TOV", value: fmtN(tbs?.TOV) },
    { label: "FG%", value: fmtPct(tbs?.FG_PCT) },
    { label: "3P%", value: fmtPct(tbs?.FG3_PCT) },
    { label: "FT%", value: fmtPct(tbs?.FT_PCT) },
  ];
  return (
    <div className="rounded border border-border bg-background-primary p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between border-b border-border-light pb-3">
        <div className="flex items-center gap-2.5">
          <TeamLogo abbr={abbr ?? ""} name={name ?? ""} size={36} />
          <div>
            <h3 className="text-sm font-semibold text-text-primary">{name ?? abbr}</h3>
            <p className="mt-0.5 text-xs text-text-secondary">
              {abbr} · {won ? "Win" : "Loss"}
            </p>
          </div>
        </div>
        <p className={`text-2xl font-semibold tabular-nums leading-none ${won ? "text-text-primary" : "text-text-secondary"}`}>
          {score ?? "—"}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-y-2 sm:grid-cols-5 lg:grid-cols-9 divide-y sm:divide-y-0 sm:divide-x divide-border-light">
        {stats.map(({ label, value }, idx) => (
          <div key={label} className={`text-center ${idx > 0 ? "sm:px-1" : ""}`}>
            <p className="text-sm font-semibold tabular-nums text-text-primary">{value}</p>
            <p className="text-xs text-text-muted">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Main Component ── */
export default function GameDetailPanel({
  game,
  season,
  highlightPlayerId,
  onBack,
}: GameDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<"info" | "teams" | "players" | "highlights" | "pbp">("info");
  const [playerTeam, setPlayerTeam] = useState<"home" | "away">("home");
  const [homeBS, setHomeBS] = useState<TBS | null>(null);
  const [awayBS, setAwayBS] = useState<TBS | null>(null);
  const [homePlayers, setHomePlayers] = useState<PBS[]>([]);
  const [awayPlayers, setAwayPlayers] = useState<PBS[]>([]);
  const [loading, setLoading] = useState(true);

  const normGameId = normId(game.GAME_ID);

  useEffect(() => {
    loadArchivedGameBoxscores(season, game.GAME_ID).then(({ team_boxscores: teamData, player_boxscores: playerData }) => {
      const gameTeams: TBS[] = (teamData as TBS[]).filter(
        (t) => normId(t.GAME_ID) === normGameId
      );
      setHomeBS(
        gameTeams.find((t) => t.TEAM_ABBREVIATION === game.HOME_TEAM_ABBREVIATION) ?? null
      );
      setAwayBS(
        gameTeams.find((t) => t.TEAM_ABBREVIATION === game.AWAY_TEAM_ABBREVIATION) ?? null
      );

      const gamePlayers: PBS[] = (playerData as PBS[]).filter(
        (p) => normId(p.GAME_ID) === normGameId
      );
      setHomePlayers(
        gamePlayers.filter((p) => p.TEAM_ABBREVIATION === game.HOME_TEAM_ABBREVIATION)
      );
      setAwayPlayers(
        gamePlayers.filter((p) => p.TEAM_ABBREVIATION === game.AWAY_TEAM_ABBREVIATION)
      );
      setLoading(false);
    }).catch(() => {
      setHomeBS(null);
      setAwayBS(null);
      setHomePlayers([]);
      setAwayPlayers([]);
      setLoading(false);
    });
  }, [normGameId, season]);

  // Auto-switch to the highlighted player's team tab
  useEffect(() => {
    if (!highlightPlayerId || loading) return;
    const inHome = homePlayers.some((p) => Number(p.PLAYER_ID) === highlightPlayerId);
    const inAway = awayPlayers.some((p) => Number(p.PLAYER_ID) === highlightPlayerId);
    if (inHome) {
      setPlayerTeam("home");
      setActiveTab("players");
    } else if (inAway) {
      setPlayerTeam("away");
      setActiveTab("players");
    }
  }, [loading, homePlayers, awayPlayers, highlightPlayerId]);

  const homeWon = game.WINNER_TEAM_ABBREVIATION === game.HOME_TEAM_ABBREVIATION;
  const awayWon = game.WINNER_TEAM_ABBREVIATION === game.AWAY_TEAM_ABBREVIATION;

  const tabs = [
    { id: "info", label: "Game info" },
    { id: "teams", label: "Team stats" },
    { id: "players", label: "Player stats" },
    { id: "highlights", label: "Highlights" },
    { id: "pbp", label: "Play-by-play" },
  ] as const;

  return (
    <div className="space-y-4">
      {/* Back button */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 rounded border border-border bg-background-primary px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-background-tertiary"
      >
        <ArrowLeft size={13} />
        Back to game log
      </button>

      {/* Header card */}
      <div className="rounded border border-border bg-background-primary p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-xs">
          <span className="text-text-muted">{fmtDate(game.GAME_DATE)}</span>
          {game.IS_PLAYOFF ? (
            <span className="rounded-sm border border-border bg-background-tertiary px-1.5 py-0.5 font-medium text-text-secondary">
              Playoff
            </span>
          ) : game.SEASON_TYPE ? (
            <span className="rounded-sm border border-border bg-background-tertiary px-1.5 py-0.5 text-text-secondary">
              {game.SEASON_TYPE}
            </span>
          ) : null}
        </div>

        {/* Teams + Score */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          {/* Away */}
          <div className="flex items-center gap-2.5">
            <TeamLogo abbr={game.AWAY_TEAM_ABBREVIATION ?? ""} name={game.AWAY_TEAM_NAME ?? ""} size={40} />
            <div className="min-w-0">
              <p className={`truncate text-sm font-semibold ${awayWon ? "text-text-primary" : "text-text-secondary"}`}>
                {game.AWAY_TEAM_NAME ?? game.AWAY_TEAM_ABBREVIATION}
              </p>
              <p className="text-xs text-text-muted">Away</p>
            </div>
          </div>

          {/* Score */}
          <div className="rounded border border-border bg-background-tertiary px-4 py-2 text-center">
            <div className="flex items-baseline justify-center gap-1.5">
              <span className={`text-xl font-semibold tabular-nums ${awayWon ? "text-text-primary" : "text-text-secondary"}`}>
                {game.AWAY_SCORE ?? "—"}
              </span>
              <span className="text-xs text-text-muted">–</span>
              <span className={`text-xl font-semibold tabular-nums ${homeWon ? "text-text-primary" : "text-text-secondary"}`}>
                {game.HOME_SCORE ?? "—"}
              </span>
            </div>
            {game.WINNER_TEAM_ABBREVIATION && (
              <p className="text-xs tabular-nums text-text-muted">
                {game.WINNER_TEAM_ABBREVIATION} Win
                {game.HOME_SCORE != null && game.AWAY_SCORE != null && (
                  <span> · +{Math.abs(game.HOME_SCORE - game.AWAY_SCORE)}</span>
                )}
              </p>
            )}
          </div>

          {/* Home */}
          <div className="flex items-center justify-end gap-2.5 text-right">
            <div className="min-w-0">
              <p className={`truncate text-sm font-semibold ${homeWon ? "text-text-primary" : "text-text-secondary"}`}>
                {game.HOME_TEAM_NAME ?? game.HOME_TEAM_ABBREVIATION}
              </p>
              <p className="text-xs text-text-muted">Home</p>
            </div>
            <TeamLogo abbr={game.HOME_TEAM_ABBREVIATION ?? ""} name={game.HOME_TEAM_NAME ?? ""} size={40} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <nav aria-label="Game details" className="flex gap-1 border-b border-border bg-background-primary pb-px">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? "border-primary text-text-primary"
                : "border-transparent text-text-secondary hover:border-border hover:text-text-primary"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Loading */}
      {loading && (
        <div className="flex h-32 items-center justify-center gap-2 rounded border border-border bg-background-primary">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-xs text-text-secondary">Loading box scores...</span>
        </div>
      )}

      {/* General game information */}
      {!loading && activeTab === "info" && (
        <section className="rounded border border-border bg-background-primary p-4 sm:p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-text-primary">General information</h2>
            <p className="mt-0.5 text-xs text-text-secondary">Match context and final result</p>
          </div>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {[
              { label: "Date", value: fmtDate(game.GAME_DATE) || "—" },
              { label: "Season", value: season || game.SEASON },
              { label: "Competition", value: game.IS_PLAYOFF ? "Playoffs" : game.SEASON_TYPE || "Regular season" },
              { label: "Home", value: game.HOME_TEAM_NAME || game.HOME_TEAM_ABBREVIATION || "—" },
              { label: "Away", value: game.AWAY_TEAM_NAME || game.AWAY_TEAM_ABBREVIATION || "—" },
              { label: "Winner", value: game.WINNER_TEAM_ABBREVIATION || "—" },
              { label: "Margin", value: game.HOME_SCORE != null && game.AWAY_SCORE != null ? `${Math.abs(game.HOME_SCORE - game.AWAY_SCORE)} points` : "—" },
              { label: "Game ID", value: game.GAME_ID },
            ].map((item) => (
              <div key={item.label} className="rounded border border-border bg-background-tertiary p-3">
                <dt className="text-xs font-medium text-text-muted">{item.label}</dt>
                <dd className="mt-1 text-xs font-semibold tabular-nums text-text-primary">{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* Team box score */}
      {!loading && activeTab === "teams" && (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <TeamTotals
            tbs={awayBS}
            abbr={game.AWAY_TEAM_ABBREVIATION}
            name={game.AWAY_TEAM_NAME}
            score={game.AWAY_SCORE}
            won={awayWon}
          />
          <TeamTotals
            tbs={homeBS}
            abbr={game.HOME_TEAM_ABBREVIATION}
            name={game.HOME_TEAM_NAME}
            score={game.HOME_SCORE}
            won={homeWon}
          />
        </div>
      )}

      {/* Player box score */}
      {!loading && activeTab === "players" && (
        <section className="space-y-3 rounded border border-border bg-background-primary p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Player box score</h2>
              <p className="mt-0.5 text-xs text-text-secondary">Full individual game statistics</p>
            </div>
            <div className="flex rounded border border-border bg-background-primary p-0.5">
              {([
                { side: "away", abbr: game.AWAY_TEAM_ABBREVIATION },
                { side: "home", abbr: game.HOME_TEAM_ABBREVIATION },
              ] as const).map(({ side, abbr }) => (
                <button
                  key={side}
                  type="button"
                  onClick={() => setPlayerTeam(side)}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    playerTeam === side ? "bg-primary text-white" : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {abbr}
                </button>
              ))}
            </div>
          </div>
          {(playerTeam === "home" ? homePlayers : awayPlayers).length > 0 ? (
            <PlayerTable players={playerTeam === "home" ? homePlayers : awayPlayers} highlightId={highlightPlayerId} />
          ) : (
            <p className="rounded border border-border bg-background-tertiary py-8 text-center text-xs text-text-muted">
              Player box score data is not available for this team.
            </p>
          )}
        </section>
      )}

      {/* Highlights & play-by-play */}
      {!loading && (activeTab === "highlights" || activeTab === "pbp") && (
        <PlayByPlayTab
          gameId={game.GAME_ID}
          season={season}
          mode={activeTab}
        />
      )}
    </div>
  );
}

/* ── Play By Play Tab Component ── */
interface PbpEvent {
  period: number;
  clock: string;
  action_type: string;
  sub_type: string;
  team: string | null;
  player_name: string | null;
  description: string;
  score_home: number;
  score_away: number;
  points_scored: number;
  badges?: string[];
  moment_reasons?: string[];
}

interface PbpData {
  game_id: string;
  home_team: string;
  away_team: string;
  quarter_scores: {
    quarter: string;
    home: number;
    away: number;
    home_total: number;
    away_total: number;
  }[];
  events: PbpEvent[];
}

function PlayByPlayTab({
  gameId,
  season,
  mode,
}: {
  gameId: string;
  season: string;
  mode: "highlights" | "pbp";
}) {
  const [data, setData] = useState<PbpData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "q1" | "q2" | "q3" | "q4" | "scoring">("all");

  useEffect(() => {
    const normGameId = String(gameId).replace(/\D/g, "").padStart(10, "0");
    loadArchivedPlayByPlay(normGameId, season)
      .then((pbp: PbpData) => {
        setData(pbp);
        setLoading(false);
      })
      .catch((err: any) => {
        setError(err.message || "Failed to load play-by-play.");
        setLoading(false);
      });
  }, [gameId, season]);

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center gap-2 rounded border border-border bg-background-primary">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="text-xs text-text-secondary">Loading game events...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded border border-border bg-background-primary p-6 text-center">
        <p className="text-xs text-text-muted">
          Play-by-play logs are not available for this game.
        </p>
      </div>
    );
  }

  const keyMomentReasons = new Set([
    "badge", "clutch", "lead_change", "team_run", "back_to_back_3", "player_3_run",
    "30_pt_game", "20_pt_game", "double_double", "triple_double", "10_ast", "15_reb", "5_stl", "5_blk",
  ]);
  const curatedHighlights = data.events.filter((event) =>
    (event.badges?.length ?? 0) > 0 || event.moment_reasons?.some((reason) => keyMomentReasons.has(reason))
  );
  const highlights = curatedHighlights.length > 0
    ? curatedHighlights
    : data.events.filter((event) => event.points_scored > 0);
  const filteredEvents = mode === "highlights" ? highlights : data.events.filter((e) => {
    if (filter === "scoring") return e.points_scored > 0;
    if (filter === "q1") return e.period === 1;
    if (filter === "q2") return e.period === 2;
    if (filter === "q3") return e.period === 3;
    if (filter === "q4") return e.period === 4;
    return true;
  });

  return (
    <div className="space-y-4">
      {mode === "pbp" && (
        <div className="rounded border border-border bg-background-primary p-4">
          <h4 className="text-sm font-semibold text-text-primary mb-3">
            Quarter breakdown
          </h4>
          <div className="grid grid-cols-5 gap-2 text-center text-xs">
            <div className="text-left text-xs font-medium text-text-muted self-center">
              Team
            </div>
            {data.quarter_scores.map((qs) => (
              <div
                key={qs.quarter}
                className="rounded border border-border bg-background-tertiary py-1.5"
              >
                <p className="text-xs font-medium text-text-muted uppercase">
                  {qs.quarter}
                </p>
                <p className="text-xs font-semibold tabular-nums text-text-primary">
                  {qs.away} - {qs.home}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      {mode === "pbp" && (
        <div className="flex flex-wrap gap-1.5">
          {(["all", "q1", "q2", "q3", "q4", "scoring"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                filter === f
                  ? "bg-primary text-white"
                  : "border border-border bg-background-primary text-text-secondary hover:bg-background-tertiary"
              }`}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {/* Events Log */}
      <div className="rounded border border-border bg-background-primary p-4 sm:p-5">
        <div className="flex items-end justify-between gap-3 border-b border-border-light pb-3 mb-3">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">
              {mode === "highlights" ? "Game highlights" : "Play-by-play"}
            </h2>
            <p className="text-xs text-text-secondary">
              {mode === "highlights" ? "Key moments and turning points" : "Chronological event log"}
            </p>
          </div>
          <span className="text-xs tabular-nums text-text-muted">{filteredEvents.length} events</span>
        </div>
        <div className="max-h-[600px] overflow-y-auto divide-y divide-border-light">
          {filteredEvents.map((e, idx) => {
            return (
              <div
                key={`${e.period}-${e.clock}-${idx}`}
                className="grid grid-cols-[64px_1fr_auto] items-center gap-3 px-2 py-2 text-xs first:pt-1 last:pb-1"
              >
                <div className="text-xs font-medium tabular-nums text-text-muted">
                  Q{e.period} {e.clock}
                </div>

                <div className="min-w-0">
                  <p className="m-0 text-xs text-text-primary">
                    {e.player_name && <span className="font-semibold">{e.player_name} · </span>}
                    {e.team && <span className="text-text-muted">{e.team} · </span>}
                    {e.description || e.action_type}
                  </p>
                  {mode === "highlights" && (e.badges?.length || e.moment_reasons?.length) ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {[...(e.badges ?? []), ...(e.moment_reasons ?? []).filter((reason) => keyMomentReasons.has(reason) && reason !== "badge")].slice(0, 3).map((reason) => (
                        <span key={reason} className="rounded-sm border border-border bg-background-tertiary px-1.5 py-0.5 text-xs text-text-secondary capitalize">
                          {reason.replaceAll("_", " ")}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="whitespace-nowrap text-right text-xs font-semibold tabular-nums text-text-primary">
                  {e.score_away} - {e.score_home}
                  {e.points_scored > 0 && (
                    <span className="ml-1 text-xs font-medium text-status-success">
                      +{e.points_scored}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {filteredEvents.length === 0 && (
            <p className="py-8 text-center text-xs text-text-muted">
              {mode === "highlights" ? "No highlighted moments are available for this game." : "No events match the selected filter."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
