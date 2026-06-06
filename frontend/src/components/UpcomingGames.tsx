import { useEffect, useState } from "react";
import {
  Trophy,
  Calendar,
  Clock,
  Users,
  TrendingUp,
  AlertTriangle,
  Zap,
  Shield,
  Star,
} from "lucide-react";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface UpcomingGame {
  GAME_ID: string;
  GAME_DATE: string;
  HOME_TEAM_ABBREVIATION: string;
  AWAY_TEAM_ABBREVIATION: string;
  HOME_TEAM_NAME: string | null;
  AWAY_TEAM_NAME: string | null;
  SEASON_TYPE: string;
  IS_PLAYOFF: boolean;
  GAME_STATUS: string | null;
  PLAYOFF_ROUND: string | null;
  SERIES_GAME_NUMBER: number | null;
  HOME_SERIES_WINS: number | null;
  AWAY_SERIES_WINS: number | null;
  IS_ELIMINATION_GAME: boolean | null;
  CAN_CLINCH_SERIES: boolean | null;
  HOME_TEAM_WINRATE_LAST_5: number | null;
  HOME_TEAM_WINRATE_LAST_10: number | null;
  HOME_TEAM_PTS_LAST_5: number | null;
  HOME_TEAM_PTS_LAST_10: number | null;
  HOME_TEAM_DAYS_REST: number | null;
  HOME_TEAM_IS_B2B: boolean | null;
  AWAY_TEAM_WINRATE_LAST_5: number | null;
  AWAY_TEAM_WINRATE_LAST_10: number | null;
  AWAY_TEAM_PTS_LAST_5: number | null;
  AWAY_TEAM_PTS_LAST_10: number | null;
  AWAY_TEAM_DAYS_REST: number | null;
  AWAY_TEAM_IS_B2B: boolean | null;
  HOME_TOP3_CORE_PLAYERS: string | null;
  HOME_TOP5_CORE_PLAYERS: string | null;
  AWAY_TOP3_CORE_PLAYERS: string | null;
  AWAY_TOP5_CORE_PLAYERS: string | null;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
const fmtDate = (d: string | null) => {
  if (!d) return "TBD";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const fmtPct = (v: number | null) =>
  v != null ? `${(v * 100).toFixed(0)}%` : "—";

const fmtPts = (v: number | null) =>
  v != null ? v.toFixed(1) : "—";

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

// Win-rate colour coding (light theme suitable)
const winrateClass = (v: number | null) => {
  if (v == null) return "text-slate-400";
  if (v >= 0.7) return "text-emerald-600 font-bold";
  if (v >= 0.5) return "text-blue-600 font-bold";
  if (v >= 0.4) return "text-amber-600 font-bold";
  return "text-rose-600 font-bold";
};

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

function TeamBadge({
  abbr,
  name,
  isHome,
}: {
  abbr: string;
  name: string | null;
  isHome: boolean;
}) {
  const brandColor = isHome ? "text-[#1d428a]" : "text-[#c9082a]";
  return (
    <div className="flex flex-col items-center gap-1">
      {/* Large abbreviation circle */}
      <div className="w-16 h-16 rounded-full bg-slate-50 border border-slate-200/80 flex items-center justify-center shadow-xs">
        <span className={`text-xl font-black tracking-tight ${brandColor}`}>
          {abbr}
        </span>
      </div>
      <span className="text-[11px] text-slate-600 font-bold text-center leading-tight max-w-[90px]">
        {name ?? abbr}
      </span>
      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200/50">
        {isHome ? "HOME" : "AWAY"}
      </span>
    </div>
  );
}

function StatRow({
  label,
  home,
  away,
  homeClass = "text-slate-700",
  awayClass = "text-slate-700",
}: {
  label: string;
  home: string;
  away: string;
  homeClass?: string;
  awayClass?: string;
}) {
  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className={`py-1.5 pr-3 text-right text-xs font-bold tabular-nums ${homeClass}`}>
        {home}
      </td>
      <td className="py-1.5 px-3 text-center text-[10px] text-slate-400 font-bold uppercase tracking-wider whitespace-nowrap">
        {label}
      </td>
      <td className={`py-1.5 pl-3 text-left text-xs font-bold tabular-nums ${awayClass}`}>
        {away}
      </td>
    </tr>
  );
}

function CorePlayersList({
  players,
  label,
}: {
  players: string | null;
  label: string;
}) {
  if (!players) return null;
  const list = players.split(",").map((p) => p.trim());
  return (
    <div>
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">
        {label}
      </p>
      <div className="flex flex-wrap gap-1">
        {list.map((name, i) => (
          <span
            key={i}
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 border border-slate-200/80"
          >
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}

function GameCard({ game, onPredict }: { game: UpcomingGame; onPredict: (g: UpcomingGame) => void }) {
  const gameNum = game.SERIES_GAME_NUMBER;
  const finalsLabel =
    game.SEASON_TYPE === "NBA Finals" ? "🏆 NBA Finals" : game.SEASON_TYPE;

  return (
    <div className="glass-card border border-slate-100 bg-white shadow-sm hover:shadow-md transition-all rounded-2xl overflow-hidden">
      {/* Card header band */}
      <div className="bg-slate-50/80 border-b border-slate-100 px-5 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Trophy size={14} className="text-[#e5a93b] flex-shrink-0" />
          <span className="text-xs font-bold text-[#e5a93b] uppercase tracking-wider font-mono">
            {finalsLabel}
          </span>
          {gameNum != null && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#e5a93b]/10 text-[#e5a93b] border border-[#e5a93b]/20">
              Game {gameNum}
              {gameNum ? ` · ${ordinal(gameNum)} in series` : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-500 font-semibold">
          <Calendar size={11} />
          {fmtDate(game.GAME_DATE)}
          {game.GAME_STATUS && (
            <>
              <Clock size={11} className="ml-1" />
              {game.GAME_STATUS}
            </>
          )}
        </div>
      </div>

      {/* Main matchup row */}
      <div className="px-6 py-5 flex items-center justify-between gap-4">
        <TeamBadge
          abbr={game.HOME_TEAM_ABBREVIATION}
          name={game.HOME_TEAM_NAME}
          isHome={true}
        />

        {/* VS divider */}
        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          <span className="text-[11px] font-black text-slate-400 tracking-widest">
            VS
          </span>
          {game.HOME_SERIES_WINS != null && game.AWAY_SERIES_WINS != null ? (
            <div className="flex items-center gap-1 text-xs font-black">
              <span className="text-[#1d428a]">{game.HOME_SERIES_WINS}</span>
              <span className="text-slate-300">–</span>
              <span className="text-[#c9082a]">{game.AWAY_SERIES_WINS}</span>
            </div>
          ) : (
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
              Series TBD
            </span>
          )}
        </div>

        <TeamBadge
          abbr={game.AWAY_TEAM_ABBREVIATION}
          name={game.AWAY_TEAM_NAME}
          isHome={false}
        />
      </div>

      {/* Stats comparison table */}
      <div className="px-5 pb-4">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
          <TrendingUp size={9} /> Recent Form &amp; Context
        </p>
        <table className="w-full">
          <thead>
            <tr>
              <th className="text-right text-[9px] font-black text-[#1d428a] uppercase tracking-widest pb-1 pr-3 w-1/3">
                {game.HOME_TEAM_ABBREVIATION}
              </th>
              <th className="text-center text-[9px] font-bold text-slate-300 uppercase pb-1 px-3 w-1/3">
                Metric
              </th>
              <th className="text-left text-[9px] font-black text-[#c9082a] uppercase tracking-widest pb-1 pl-3 w-1/3">
                {game.AWAY_TEAM_ABBREVIATION}
              </th>
            </tr>
          </thead>
          <tbody>
            <StatRow
              label="Win% L5"
              home={fmtPct(game.HOME_TEAM_WINRATE_LAST_5)}
              away={fmtPct(game.AWAY_TEAM_WINRATE_LAST_5)}
              homeClass={winrateClass(game.HOME_TEAM_WINRATE_LAST_5)}
              awayClass={winrateClass(game.AWAY_TEAM_WINRATE_LAST_5)}
            />
            <StatRow
              label="Win% L10"
              home={fmtPct(game.HOME_TEAM_WINRATE_LAST_10)}
              away={fmtPct(game.AWAY_TEAM_WINRATE_LAST_10)}
              homeClass={winrateClass(game.HOME_TEAM_WINRATE_LAST_10)}
              awayClass={winrateClass(game.AWAY_TEAM_WINRATE_LAST_10)}
            />
            <StatRow
              label="PTS/G L5"
              home={fmtPts(game.HOME_TEAM_PTS_LAST_5)}
              away={fmtPts(game.AWAY_TEAM_PTS_LAST_5)}
            />
            <StatRow
              label="PTS/G L10"
              home={fmtPts(game.HOME_TEAM_PTS_LAST_10)}
              away={fmtPts(game.AWAY_TEAM_PTS_LAST_10)}
            />
            <StatRow
              label="Days Rest"
              home={
                game.HOME_TEAM_DAYS_REST != null
                  ? String(game.HOME_TEAM_DAYS_REST)
                  : "—"
              }
              away={
                game.AWAY_TEAM_DAYS_REST != null
                  ? String(game.AWAY_TEAM_DAYS_REST)
                  : "—"
              }
            />
            <StatRow
              label="B2B?"
              home={
                game.HOME_TEAM_IS_B2B === true
                  ? "⚡ Yes"
                  : game.HOME_TEAM_IS_B2B === false
                  ? "No"
                  : "—"
              }
              away={
                game.AWAY_TEAM_IS_B2B === true
                  ? "⚡ Yes"
                  : game.AWAY_TEAM_IS_B2B === false
                  ? "No"
                  : "—"
              }
              homeClass={
                game.HOME_TEAM_IS_B2B ? "text-amber-600 font-bold" : "text-slate-600"
              }
              awayClass={
                game.AWAY_TEAM_IS_B2B ? "text-amber-600 font-bold" : "text-slate-600"
              }
            />
          </tbody>
        </table>
      </div>

      {/* Core players section */}
      {(game.HOME_TOP3_CORE_PLAYERS || game.AWAY_TOP3_CORE_PLAYERS) && (
        <div className="px-5 pb-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
          {/* Home side */}
          <div className="space-y-2">
            <p className="text-[9px] font-bold text-[#1d428a] uppercase tracking-widest flex items-center gap-1">
              <Shield size={9} /> {game.HOME_TEAM_ABBREVIATION} Core
            </p>
            <CorePlayersList
              players={game.HOME_TOP3_CORE_PLAYERS}
              label="Top 3 Core"
            />
            <CorePlayersList
              players={game.HOME_TOP5_CORE_PLAYERS}
              label="Top 4–5"
            />
          </div>
          {/* Away side */}
          <div className="space-y-2">
            <p className="text-[9px] font-bold text-[#c9082a] uppercase tracking-widest flex items-center gap-1">
              <Shield size={9} /> {game.AWAY_TEAM_ABBREVIATION} Core
            </p>
            <CorePlayersList
              players={game.AWAY_TOP3_CORE_PLAYERS}
              label="Top 3 Core"
            />
            <CorePlayersList
              players={game.AWAY_TOP5_CORE_PLAYERS}
              label="Top 4–5"
            />
          </div>
        </div>
      )}

      {/* Card actions */}
      <div className="px-5 py-4 border-t border-slate-100 flex justify-end">
        <button
          className="btn-primary"
          onClick={() => onPredict(game)}
        >
          Predict
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main Page Component
// ─────────────────────────────────────────────
export default function UpcomingGames() {
  const [games, setGames] = useState<UpcomingGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedGame, setSelectedGame] = useState<UpcomingGame | null>(null);
  const [predicting, setPredicting] = useState(false);
  const [predictionResult, setPredictionResult] = useState<any | null>(null);
  const [predictionError, setPredictionError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/data/upcoming_games_context.json")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load upcoming games data.");
        return r.json();
      })
      .then((data) => {
        setGames(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  const handlePredict = async (game: UpcomingGame) => {
    setSelectedGame(game);
    setModalOpen(true);
    setPredictionResult(null);
    setPredictionError(null);
    setPredicting(true);

    try {
      // Validate date format YYYY-MM-DD
      const dateStr = game.GAME_DATE;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        throw new Error('Invalid date format for prediction_date. Expected YYYY-MM-DD.');
      }

      const res = await fetch('/api/nba/predictions/win-probability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ home_team: game.HOME_TEAM_ABBREVIATION, away_team: game.AWAY_TEAM_ABBREVIATION, prediction_date: dateStr })
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || `ML service returned ${res.status}`);
      }
      const data = await res.json();
      setPredictionResult(data);
    } catch (e: any) {
      setPredictionError(e.message || 'Prediction failed');
    } finally {
      setPredicting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-[#1d428a]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-rose-50 text-rose-800 border border-rose-200 p-6 rounded-xl text-center space-y-2">
        <AlertTriangle size={32} className="mx-auto mb-1 text-rose-600" />
        <p className="text-sm font-bold">{error}</p>
        <p className="text-xs text-slate-500">
          Run:{" "}
          <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10px]">
            python3 main.py --build-schedule-context
          </code>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Zap size={22} className="text-[#e5a93b]" />
          <h1 className="text-3xl font-black tracking-tight text-slate-900 m-0 uppercase animate-fade-in" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            Upcoming Games
          </h1>
        </div>
        <p className="text-sm text-slate-500 m-0">
          2025-26 NBA Season · Schedule &amp; Context Layer
        </p>
      </div>

      {/* No-prediction banner */}
      <div className="flex items-start gap-3 rounded-xl bg-amber-50 text-amber-800 border border-amber-200/80 p-4 shadow-xs">
        <AlertTriangle
          size={18}
          className="text-amber-600 flex-shrink-0 mt-0.5"
        />
        <div>
          <p className="text-xs font-bold uppercase tracking-wider m-0">
            No Prediction Active
          </p>
          <p className="text-xs text-slate-600 m-0 mt-0.5 leading-relaxed">
            Model training is not implemented. This section shows schedule
            context, recent form, and roster data only — no win probabilities,
            predictions, or betting language.
          </p>
        </div>
      </div>

      {/* Summary stat pills */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 shadow-xs">
          <Calendar size={13} className="text-[#1d428a]" />
          {games.length} Upcoming Game{games.length !== 1 ? "s" : ""}
        </div>
        {games[0]?.SEASON_TYPE && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 shadow-xs">
            <Trophy size={13} className="text-[#e5a93b]" />
            {games[0].SEASON_TYPE}
          </div>
        )}
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 shadow-xs">
          <Star size={13} className="text-[#c9082a]" />
          Core Player Context Included
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 shadow-xs">
          <Users size={13} className="text-slate-400" />
          V2 Rolling Features (Last Available)
        </div>
      </div>

      {/* Games grid */}
      {games.length === 0 ? (
        <div className="text-center py-20 bg-white border border-slate-100 rounded-2xl shadow-sm">
          <Calendar size={40} className="mx-auto text-slate-300 mb-4" />
          <p className="text-sm font-bold text-slate-500">
            No upcoming games found.
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Update the source CSVs and re-run{" "}
            <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10px]">
              --build-schedule-context
            </code>
            .
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {games.map((game) => (
            <GameCard key={game.GAME_ID} game={game} onPredict={handlePredict} />
          ))}
        </div>
      )}

      {/* Data provenance footer */}
      <div className="rounded-xl bg-slate-50/50 border border-slate-200/60 px-5 py-4 text-[10px] text-slate-500 font-mono space-y-1 shadow-2xs">
        <p className="font-bold text-slate-700 text-xs not-italic">Data Sources</p>
        <p>
          Schedule: <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-600">data/raw/schedule/nba_schedule_2025_26.csv</code>{" "}
          (played games) +{" "}
          <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-600">data/raw/schedule/nba_finals_upcoming_2025_26.csv</code>{" "}
          (manually corrected)
        </p>
        <p>
          Team context: <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-600">data/processed/team_model_ready_v2_2025_26.csv</code>{" "}
          — last available row per team
        </p>
        <p>
          Core players: <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-600">data/analysis/core_players.csv</code> — ranked by
          importance score
        </p>
      </div>

      {/* Prediction modal (renders when user clicks Predict) */}
      {modalOpen && selectedGame && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-lg">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold">Prediction: {selectedGame.HOME_TEAM_ABBREVIATION} vs {selectedGame.AWAY_TEAM_ABBREVIATION}</h3>
                <p className="text-xs text-slate-500">{fmtDate(selectedGame.GAME_DATE)}</p>
              </div>
              <button className="text-slate-400 text-sm" onClick={() => setModalOpen(false)}>Close</button>
            </div>

            <div className="mt-4">
              {predicting && <div className="text-sm text-slate-500">Predicting…</div>}
              {predictionError && <div className="text-sm text-rose-600">{predictionError}</div>}
              {predictionResult && (
                <div className="space-y-2">
                  <p><strong>Predicted winner:</strong> {predictionResult.predicted_winner}</p>
                  <p><strong>Home win prob:</strong> {predictionResult.home_win_probability}</p>
                  <p><strong>Away win prob:</strong> {predictionResult.away_win_probability}</p>
                  <p><strong>Confidence:</strong> {predictionResult.confidence_bucket}</p>
                  <p className="text-xs text-slate-500 mt-2">Model version: {predictionResult.model_version ?? 'unknown'}</p>
                </div>
              )}
            </div>

            <div className="mt-6 text-right">
              <button className="btn" onClick={() => setModalOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
