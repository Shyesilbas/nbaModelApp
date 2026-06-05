import { useEffect, useState, useMemo } from "react";
import {
  Calendar,
  Trophy,
  Clock,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Zap,
  Search,
  Filter,
  TrendingUp,
  Shield,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
interface ScheduleGame {
  GAME_ID: string;
  GAME_DATE: string;
  HOME_TEAM_ABBREVIATION: string;
  AWAY_TEAM_ABBREVIATION: string;
  HOME_TEAM_NAME: string | null;
  AWAY_TEAM_NAME: string | null;
  SEASON_TYPE: string;
  IS_PLAYOFF: boolean | null;
  GAME_STATUS: string | null;
  PLAYOFF_ROUND: string | null;
  SERIES_GAME_NUMBER: number | null;
  HOME_SERIES_WINS: number | null;
  AWAY_SERIES_WINS: number | null;
  IS_ELIMINATION_GAME: boolean | null;
  CAN_CLINCH_SERIES: boolean | null;
  // Context fields (only for upcoming games)
  HOME_TEAM_WINRATE_LAST_5?: number | null;
  HOME_TEAM_WINRATE_LAST_10?: number | null;
  HOME_TEAM_PTS_LAST_5?: number | null;
  HOME_TEAM_PTS_LAST_10?: number | null;
  HOME_TEAM_DAYS_REST?: number | null;
  HOME_TEAM_IS_B2B?: boolean | null;
  AWAY_TEAM_WINRATE_LAST_5?: number | null;
  AWAY_TEAM_WINRATE_LAST_10?: number | null;
  AWAY_TEAM_PTS_LAST_5?: number | null;
  AWAY_TEAM_PTS_LAST_10?: number | null;
  AWAY_TEAM_DAYS_REST?: number | null;
  AWAY_TEAM_IS_B2B?: boolean | null;
  HOME_TOP3_CORE_PLAYERS?: string | null;
  HOME_TOP5_CORE_PLAYERS?: string | null;
  AWAY_TOP3_CORE_PLAYERS?: string | null;
  AWAY_TOP5_CORE_PLAYERS?: string | null;
  _isUpcoming?: boolean;
}

type FilterType = "ALL" | "Regular Season" | "Playoffs" | "PlayIn" | "NBA Finals" | "UPCOMING";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const today = new Date();
today.setHours(0, 0, 0, 0);

const fmtDate = (d: string) => {
  const dt = new Date(d + "T12:00:00");
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
};

const fmtPct = (v: number | null | undefined) => v != null ? `${(v * 100).toFixed(0)}%` : "—";
const fmtPts = (v: number | null | undefined) => v != null ? v.toFixed(1) : "—";

const winrateColor = (v: number | null | undefined) => {
  if (v == null) return "#64748b";
  if (v >= 0.7) return "#34d399";
  if (v >= 0.5) return "#38bdf8";
  if (v >= 0.4) return "#fbbf24";
  return "#f87171";
};

const seasonTypeMeta = (type: string, isUpcoming: boolean) => {
  if (isUpcoming) return { badge: "badge-upcoming", glyph: "🔴", cardClass: "card-finals", ringClass: "team-ring-finals" };
  if (type === "NBA Finals") return { badge: "badge-finals", glyph: "🏆", cardClass: "card-finals", ringClass: "team-ring-finals" };
  if (type === "Playoffs") return { badge: "badge-playoff", glyph: "🏀", cardClass: "card-playoff", ringClass: "team-ring-playoff" };
  if (type === "PlayIn") return { badge: "badge-playin", glyph: "⚡", cardClass: "glass", ringClass: "team-ring" };
  return { badge: "badge-regular", glyph: "", cardClass: "glass", ringClass: "team-ring" };
};

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function SeasonBadge({ type, isUpcoming }: { type: string; isUpcoming: boolean }) {
  if (isUpcoming) return <span className="badge-upcoming">🔴 UPCOMING</span>;
  if (type === "NBA Finals") return <span className="badge-finals">🏆 NBA Finals</span>;
  if (type === "Playoffs") return <span className="badge-playoff">🏀 Playoffs</span>;
  if (type === "PlayIn") return <span className="badge-playin">⚡ Play-In</span>;
  return <span className="badge-regular">Regular Season</span>;
}

// Compact list row for past games
function GameRow({ game, index }: { game: ScheduleGame; index: number }) {
  const upcoming = game._isUpcoming ?? false;
  const meta = seasonTypeMeta(game.SEASON_TYPE, upcoming);
  const staggerClass = `stagger-${Math.min(index % 6 + 1, 6)}`;

  return (
    <div className={`animate-fade-in-up ${staggerClass} ${meta.cardClass} rounded-xl px-5 py-3.5 flex items-center gap-4 transition-all duration-300 hover:scale-[1.005]`}>
      {/* Date */}
      <div className="w-16 flex-shrink-0 text-center">
        <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">
          {new Date(game.GAME_DATE + "T12:00:00").toLocaleDateString("en-US", { month: "short" })}
        </p>
        <p className="text-2xl font-black text-white leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
          {new Date(game.GAME_DATE + "T12:00:00").getDate()}
        </p>
      </div>

      {/* Divider */}
      <div className="w-px h-8 bg-white/[0.06] flex-shrink-0" />

      {/* Away team */}
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        <div className={meta.ringClass}>{game.AWAY_TEAM_ABBREVIATION}</div>
        <div className="min-w-0">
          <p className="text-xs font-black text-white truncate" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "15px" }}>
            {game.AWAY_TEAM_ABBREVIATION}
          </p>
          <p className="text-[10px] text-slate-500 font-semibold">AWAY</p>
        </div>
      </div>

      {/* VS / score center */}
      <div className="flex-shrink-0 text-center px-2">
        {upcoming ? (
          <div>
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">vs</p>
            {game.GAME_STATUS && (
              <p className="text-[10px] text-emerald-400 font-bold mt-0.5">{game.GAME_STATUS}</p>
            )}
          </div>
        ) : (
          <p className="text-[11px] font-bold text-slate-600">–</p>
        )}
      </div>

      {/* Home team */}
      <div className="flex items-center gap-2.5 flex-1 min-w-0 flex-row-reverse">
        <div className={meta.ringClass}>{game.HOME_TEAM_ABBREVIATION}</div>
        <div className="min-w-0 text-right">
          <p className="text-xs font-black text-white truncate" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "15px" }}>
            {game.HOME_TEAM_ABBREVIATION}
          </p>
          <p className="text-[10px] text-slate-500 font-semibold">HOME</p>
        </div>
      </div>

      {/* Right meta */}
      <div className="flex-shrink-0 flex flex-col items-end gap-1 w-32">
        <SeasonBadge type={game.SEASON_TYPE} isUpcoming={upcoming} />
        {game.SERIES_GAME_NUMBER != null && (
          <p className="text-[9px] text-slate-600 font-semibold">Game {game.SERIES_GAME_NUMBER}</p>
        )}
      </div>
    </div>
  );
}

// Expanded card for upcoming games with full context
function UpcomingGameCard({ game, index }: { game: ScheduleGame; index: number }) {
  const [expanded, setExpanded] = useState(true);
  const meta = seasonTypeMeta(game.SEASON_TYPE, true);
  const staggerClass = `stagger-${Math.min(index + 1, 6)}`;

  return (
    <div className={`animate-fade-in-up ${staggerClass} ${meta.cardClass} rounded-2xl overflow-hidden transition-all duration-300`}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.05]">
        <div className="flex items-center gap-2.5">
          <SeasonBadge type={game.SEASON_TYPE} isUpcoming={true} />
          {game.PLAYOFF_ROUND && (
            <span className="text-[10px] text-slate-500 font-semibold">{game.PLAYOFF_ROUND}</span>
          )}
          {game.SERIES_GAME_NUMBER != null && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
              Game {game.SERIES_GAME_NUMBER}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-semibold">
            <Calendar size={10} />
            {fmtDate(game.GAME_DATE)}
            {game.GAME_STATUS && (
              <>
                <span className="text-slate-700">·</span>
                <Clock size={10} />
                <span className="text-emerald-400">{game.GAME_STATUS}</span>
              </>
            )}
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 rounded-lg text-slate-600 hover:text-slate-300 hover:bg-white/[0.05] transition-colors"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Main matchup */}
      <div className="px-6 py-5 flex items-center justify-between gap-4">
        {/* Away */}
        <div className="flex flex-col items-center gap-2">
          <div style={{
            width: 64, height: 64, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
            background: "linear-gradient(145deg, #1a2540, #0f1827)",
            border: "2px solid rgba(234,179,8,0.3)",
            boxShadow: "0 0 24px rgba(234,179,8,0.1), inset 0 1px 0 rgba(234,179,8,0.08)",
            fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900, fontSize: 18, color: "#e2e8f0"
          }}>
            {game.AWAY_TEAM_ABBREVIATION}
          </div>
          <p className="text-xs font-bold text-slate-300">{game.AWAY_TEAM_NAME ?? game.AWAY_TEAM_ABBREVIATION}</p>
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-600 border border-slate-700/40">AWAY</span>
        </div>

        {/* Center */}
        <div className="flex flex-col items-center gap-1.5 flex-1">
          <p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.25em]">vs</p>
          {game.HOME_SERIES_WINS != null && game.AWAY_SERIES_WINS != null ? (
            <div className="flex items-center gap-2">
              <span className="text-lg font-black text-cyan-300" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                {game.HOME_SERIES_WINS}
              </span>
              <span className="text-slate-700 font-black">–</span>
              <span className="text-lg font-black text-amber-300" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                {game.AWAY_SERIES_WINS}
              </span>
            </div>
          ) : (
            <span className="text-[9px] text-slate-700 font-semibold">Series TBD</span>
          )}
        </div>

        {/* Home */}
        <div className="flex flex-col items-center gap-2">
          <div style={{
            width: 64, height: 64, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
            background: "linear-gradient(145deg, #1a2540, #0f1827)",
            border: "2px solid rgba(56,189,248,0.3)",
            boxShadow: "0 0 24px rgba(56,189,248,0.1), inset 0 1px 0 rgba(56,189,248,0.08)",
            fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900, fontSize: 18, color: "#e2e8f0"
          }}>
            {game.HOME_TEAM_ABBREVIATION}
          </div>
          <p className="text-xs font-bold text-slate-300">{game.HOME_TEAM_NAME ?? game.HOME_TEAM_ABBREVIATION}</p>
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-600 border border-slate-700/40">HOME</span>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-white/[0.04] pt-4">
          {/* Stats comparison */}
          <div>
            <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-1.5 mb-2">
              <TrendingUp size={9} /> Recent Form (Last Available)
            </p>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="text-right text-[9px] font-black text-amber-400 uppercase tracking-widest pb-1.5 pr-3 w-2/5">
                    {game.AWAY_TEAM_ABBREVIATION}
                  </th>
                  <th className="text-center text-[9px] font-semibold text-slate-700 pb-1.5 w-1/5">Metric</th>
                  <th className="text-left text-[9px] font-black text-cyan-400 uppercase tracking-widest pb-1.5 pl-3 w-2/5">
                    {game.HOME_TEAM_ABBREVIATION}
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "Win% L5", home: fmtPct(game.HOME_TEAM_WINRATE_LAST_5), away: fmtPct(game.AWAY_TEAM_WINRATE_LAST_5), homeColor: winrateColor(game.HOME_TEAM_WINRATE_LAST_5), awayColor: winrateColor(game.AWAY_TEAM_WINRATE_LAST_5) },
                  { label: "Win% L10", home: fmtPct(game.HOME_TEAM_WINRATE_LAST_10), away: fmtPct(game.AWAY_TEAM_WINRATE_LAST_10), homeColor: winrateColor(game.HOME_TEAM_WINRATE_LAST_10), awayColor: winrateColor(game.AWAY_TEAM_WINRATE_LAST_10) },
                  { label: "PPG L5", home: fmtPts(game.HOME_TEAM_PTS_LAST_5), away: fmtPts(game.AWAY_TEAM_PTS_LAST_5), homeColor: "#e2e8f0", awayColor: "#e2e8f0" },
                  { label: "Days Rest", home: game.HOME_TEAM_DAYS_REST?.toString() ?? "—", away: game.AWAY_TEAM_DAYS_REST?.toString() ?? "—", homeColor: "#e2e8f0", awayColor: "#e2e8f0" },
                  { label: "B2B", home: game.HOME_TEAM_IS_B2B ? "⚡ Yes" : "No", away: game.AWAY_TEAM_IS_B2B ? "⚡ Yes" : "No", homeColor: game.HOME_TEAM_IS_B2B ? "#fbbf24" : "#64748b", awayColor: game.AWAY_TEAM_IS_B2B ? "#fbbf24" : "#64748b" },
                ].map(({ label, home, away, homeColor, awayColor }) => (
                  <tr key={label} className="border-b border-white/[0.04] last:border-0">
                    <td className="py-1.5 pr-3 text-right text-xs font-bold tabular-nums" style={{ color: awayColor }}>{away}</td>
                    <td className="py-1.5 text-center text-[9px] text-slate-600 font-semibold uppercase tracking-wider">{label}</td>
                    <td className="py-1.5 pl-3 text-left text-xs font-bold tabular-nums" style={{ color: homeColor }}>{home}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Core players */}
          {(game.HOME_TOP3_CORE_PLAYERS || game.AWAY_TOP3_CORE_PLAYERS) && (
            <div className="grid grid-cols-2 gap-4 pt-3 border-t border-white/[0.04]">
              {[
                { label: game.AWAY_TEAM_ABBREVIATION, color: "text-amber-400", top3: game.AWAY_TOP3_CORE_PLAYERS, top5: game.AWAY_TOP5_CORE_PLAYERS },
                { label: game.HOME_TEAM_ABBREVIATION, color: "text-cyan-400", top3: game.HOME_TOP3_CORE_PLAYERS, top5: game.HOME_TOP5_CORE_PLAYERS },
              ].map(({ label, color, top3, top5 }) => (
                <div key={label} className="space-y-2">
                  <p className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-1 ${color}`}>
                    <Shield size={8} /> {label} Core
                  </p>
                  {top3 && (
                    <div>
                      <p className="text-[8px] text-slate-700 font-bold uppercase mb-1">Top 3</p>
                      <div className="flex flex-wrap gap-1">
                        {top3.split(",").map((p, i) => (
                          <span key={i} className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-800/60 text-slate-300 border border-slate-700/40">
                            {p.trim()}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {top5 && top3 && top5 !== top3 && (
                    <div>
                      <p className="text-[8px] text-slate-700 font-bold uppercase mb-1">+ Secondary</p>
                      <div className="flex flex-wrap gap-1">
                        {top5.split(",").filter(p => !top3.includes(p)).map((p, i) => (
                          <span key={i} className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-900/60 text-slate-500 border border-slate-800/40">
                            {p.trim()}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────

export default function Schedule() {
  const [upcomingGames, setUpcomingGames] = useState<ScheduleGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/data/schedule.json").then(r => { if (!r.ok) throw new Error("schedule.json"); return r.json(); }),
      fetch("/data/upcoming_games_context.json").then(r => { if (!r.ok) throw new Error("upcoming_games_context.json"); return r.json(); }),
    ])
      .then(([sched, upcoming]) => {
        // Find upcoming games
        const upcomingIds = new Set((upcoming as ScheduleGame[]).map(g => g.GAME_ID));
        const merged = (sched as ScheduleGame[]).map(g => ({
          ...g,
          _isUpcoming: upcomingIds.has(g.GAME_ID),
        }));
        // Enrich with context data
        const contextMap = new Map((upcoming as ScheduleGame[]).map(g => [g.GAME_ID, g]));
        const enriched = merged
          .filter(g => upcomingIds.has(g.GAME_ID))
          .map(g => contextMap.has(g.GAME_ID) ? { ...g, ...contextMap.get(g.GAME_ID), _isUpcoming: true } : g);
        
        // Also add upcoming games not in main schedule (shouldn't happen but safe)
        const mainIds = new Set(enriched.map(g => g.GAME_ID));
        const extra = (upcoming as ScheduleGame[]).filter(g => !mainIds.has(g.GAME_ID)).map(g => ({ ...g, _isUpcoming: true }));
        
        setUpcomingGames([...enriched, ...extra]);
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64 gap-3">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-500 border-t-transparent" />
      <span className="text-xs text-slate-500 font-bold uppercase tracking-widest">Loading Schedule...</span>
    </div>
  );

  if (error) return (
    <div className="text-center py-16">
      <AlertTriangle size={32} className="mx-auto text-rose-400 mb-3" />
      <p className="text-sm font-bold text-rose-300">{error}</p>
      <p className="text-xs text-slate-500 mt-2">
        Run: <code className="bg-slate-900 px-2 py-0.5 rounded font-mono">python3 main.py --build-schedule-context</code>
      </p>
    </div>
  );

  return (
    <div className="space-y-8 relative">
      {/* Ambient glows */}
      <div className="glow-gold absolute -top-20 right-0 pointer-events-none" />
      <div className="glow-bg absolute top-40 -left-20 pointer-events-none" />

      {/* ── Page header ─────────────────────────────────────── */}
      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-1">
          <Calendar size={22} className="text-sky-400" />
          <h1 className="text-3xl font-black text-white tracking-tight" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            Upcoming NBA Fixtures
          </h1>
        </div>
        <p className="text-sm text-slate-500">Upcoming games and series playoff context</p>
      </div>

      {/* ── No-prediction banner ────────────────────────────── */}
      <div className="relative z-10 flex items-start gap-3 rounded-xl bg-amber-500/[0.07] border border-amber-500/20 px-5 py-3.5">
        <AlertTriangle size={15} className="text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-200/60 font-medium leading-relaxed">
          <span className="text-amber-300 font-bold">No prediction yet — </span>
          model training is not implemented. This page shows schedule context and historical data only.
        </p>
      </div>

      {/* ── Summary stat pills ──────────────────────────────── */}
      <div className="relative z-10 flex flex-wrap gap-2">
        <div className="glass flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold">
          <span className="text-slate-600">Upcoming Matches</span>
          <span className="text-emerald-400">{upcomingGames.length}</span>
        </div>
        <div className="glass flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold">
          <span className="text-slate-600">Season Stage</span>
          <span className="text-amber-400">NBA Finals</span>
        </div>
      </div>

      {/* ── Upcoming games section ──────────────────────────── */}
      {upcomingGames.length > 0 ? (
        <div className="relative z-10 space-y-4">
          <div className="flex items-center gap-3">
            <Zap size={16} className="text-emerald-400" />
            <h2 className="text-lg font-black text-white" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              Scheduled Matchups
            </h2>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {upcomingGames.map((game, i) => (
              <UpcomingGameCard key={game.GAME_ID} game={game} index={i} />
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-16 text-slate-500 relative z-10">
          <Calendar size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-bold">No upcoming games scheduled</p>
        </div>
      )}
    </div>
  );
}
