import { useState, useEffect, useCallback } from "react";
import {
  Trophy,
  AlertTriangle,
  Cpu,
  Sparkles,
  RefreshCw,
  Activity,
  ChevronDown,
  ChevronUp,
  Shield,
  Zap,
  Home,
  TrendingUp,
  Target,
  BarChart2,
  Calendar,
  Users,
} from "lucide-react";
import TeamLogo from "./TeamLogo";

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const NBA_TEAMS = [
  { abbr: "ATL", name: "Atlanta Hawks", color: "#e31837" },
  { abbr: "BOS", name: "Boston Celtics", color: "#007a33" },
  { abbr: "BKN", name: "Brooklyn Nets", color: "#111827" },
  { abbr: "CHA", name: "Charlotte Hornets", color: "#00788c" },
  { abbr: "CHI", name: "Chicago Bulls", color: "#ce1141" },
  { abbr: "CLE", name: "Cleveland Cavaliers", color: "#860038" },
  { abbr: "DAL", name: "Dallas Mavericks", color: "#0053bc" },
  { abbr: "DEN", name: "Denver Nuggets", color: "#0e2240" },
  { abbr: "DET", name: "Detroit Pistons", color: "#c8102e" },
  { abbr: "GSW", name: "Golden State Warriors", color: "#1d428a" },
  { abbr: "HOU", name: "Houston Rockets", color: "#ce1141" },
  { abbr: "IND", name: "Indiana Pacers", color: "#fdbb30" },
  { abbr: "LAC", name: "LA Clippers", color: "#c8102e" },
  { abbr: "LAL", name: "Los Angeles Lakers", color: "#552583" },
  { abbr: "MEM", name: "Memphis Grizzlies", color: "#5d76a9" },
  { abbr: "MIA", name: "Miami Heat", color: "#98002e" },
  { abbr: "MIL", name: "Milwaukee Bucks", color: "#00471b" },
  { abbr: "MIN", name: "Minnesota Timberwolves", color: "#0c2340" },
  { abbr: "NOP", name: "New Orleans Pelicans", color: "#0c2340" },
  { abbr: "NYK", name: "New York Knicks", color: "#1d428a" },
  { abbr: "OKC", name: "Oklahoma City Thunder", color: "#007ac1" },
  { abbr: "ORL", name: "Orlando Magic", color: "#0077c0" },
  { abbr: "PHI", name: "Philadelphia 76ers", color: "#006bb6" },
  { abbr: "PHX", name: "Phoenix Suns", color: "#e56020" },
  { abbr: "POR", name: "Portland Trail Blazers", color: "#e03a3e" },
  { abbr: "SAC", name: "Sacramento Kings", color: "#5a2d81" },
  { abbr: "SAS", name: "San Antonio Spurs", color: "#22252a" },
  { abbr: "TOR", name: "Toronto Raptors", color: "#ce1141" },
  { abbr: "UTA", name: "Utah Jazz", color: "#f9a01b" },
  { abbr: "WAS", name: "Washington Wizards", color: "#002b5c" },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function WinProbabilityArc({
  homeProb,
  awayProb,
  homeColor,
  awayColor,
  homeAbbr,
  awayAbbr,
  confidence,
  margin,
  winnerAbbr,
}: {
  homeProb: number;
  awayProb: number;
  homeColor: string;
  awayColor: string;
  homeAbbr: string;
  awayAbbr: string;
  confidence: string;
  margin: number;
  winnerAbbr: string;
}) {
  const size = 220;
  const cx = size / 2;
  const cy = size / 2 + 20;
  const r = 88;
  const strokeW = 14;
  const startAngle = -200;
  const totalAngle = 220;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const polarToXY = (angle: number) => ({
    x: cx + r * Math.cos(toRad(angle)),
    y: cy + r * Math.sin(toRad(angle)),
  });

  const arcPath = (startDeg: number, endDeg: number) => {
    const s = polarToXY(startDeg);
    const e = polarToXY(endDeg);
    const largeArc = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${largeArc} 1 ${e.x} ${e.y}`;
  };

  const awayEndAngle = startAngle + totalAngle * awayProb;
  const homeEndAngle = awayEndAngle + totalAngle * homeProb;
  const gapAngle = 1;

  const confColor =
    confidence?.toUpperCase().includes("STRONG")
      ? "#10b981"
      : confidence?.toUpperCase().includes("MODERATE")
      ? "#3b82f6"
      : "#f59e0b";

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size - 10} viewBox={`0 0 ${size} ${size - 10}`}>
        {/* Track */}
        <path
          d={arcPath(startAngle, startAngle + totalAngle)}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={strokeW}
          strokeLinecap="round"
        />
        {/* Away arc */}
        {awayProb > 0.01 && (
          <path
            d={arcPath(startAngle, awayEndAngle - gapAngle)}
            fill="none"
            stroke={awayColor}
            strokeWidth={strokeW}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 6px ${awayColor}66)` }}
          />
        )}
        {/* Home arc */}
        {homeProb > 0.01 && (
          <path
            d={arcPath(awayEndAngle + gapAngle, homeEndAngle)}
            fill="none"
            stroke={homeColor}
            strokeWidth={strokeW}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 6px ${homeColor}66)` }}
          />
        )}
        {/* Center confidence ring */}
        <circle cx={cx} cy={cy} r={r - strokeW - 10} fill="none" stroke={confColor} strokeWidth={2} strokeOpacity={0.25} />
        {/* Margin label */}
        <text x={cx} y={cy - 12} textAnchor="middle" fill="white" fontSize="11" fontWeight="800" letterSpacing="2" fontFamily="monospace" opacity={0.5}>
          MARGIN
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fill="white" fontSize="26" fontWeight="900" fontFamily="'Barlow Condensed', sans-serif">
          {Math.abs(margin).toFixed(1)}
        </text>
        <text x={cx} y={cy + 32} textAnchor="middle" fill="white" fontSize="10" fontWeight="700" opacity={0.5} fontFamily="monospace">
          {winnerAbbr} LEAD
        </text>
      </svg>
      {/* Labels */}
      <div className="flex justify-between w-full px-2 -mt-1">
        <div className="text-center">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Away</p>
          <p className="text-base font-black font-mono" style={{ color: awayColor }}>
            {(awayProb * 100).toFixed(1)}%
          </p>
          <p className="text-[9px] text-white/50 font-bold">{awayAbbr}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Home</p>
          <p className="text-base font-black font-mono" style={{ color: homeColor }}>
            {(homeProb * 100).toFixed(1)}%
          </p>
          <p className="text-[9px] text-white/50 font-bold">{homeAbbr}</p>
        </div>
      </div>
    </div>
  );
}

function SignalCards({
  result,
  homeInfo,
  awayInfo,
  winnerInfo,
}: {
  result: any;
  homeInfo: { name: string; abbr: string; color: string };
  awayInfo: { name: string; abbr: string; color: string };
  winnerInfo: { name: string; abbr: string; color: string };
}) {
  const win = result.win_probability;
  const score = result.score_prediction;
  const winProb = Math.max(win?.home_win_probability ?? 0, win?.away_win_probability ?? 0);
  const margin = score ? Math.abs(score.predicted_margin) : null;
  const isHome = win?.predicted_winner === homeInfo.abbr;

  const signals = [
    {
      icon: <Home size={16} />,
      label: "Home Court",
      value: isHome ? `+${homeInfo.abbr} Edge` : `Neutral Factor`,
      detail: isHome ? "Home team favored" : "Away team overcoming",
      color: winnerInfo.color,
      accent: "border-l-[3px]",
    },
    {
      icon: <TrendingUp size={16} />,
      label: "Win Probability",
      value: `${(winProb * 100).toFixed(1)}%`,
      detail: "Model confidence",
      color: winProb > 0.65 ? "#10b981" : winProb > 0.55 ? "#3b82f6" : "#f59e0b",
      accent: "border-l-[3px]",
    },
    {
      icon: <Target size={16} />,
      label: "Confidence Tier",
      value: win?.confidence_bucket || "MEDIUM",
      detail: "Prediction strength",
      color:
        win?.confidence_bucket?.toUpperCase().includes("STRONG")
          ? "#10b981"
          : win?.confidence_bucket?.toUpperCase().includes("MODERATE")
          ? "#3b82f6"
          : "#f59e0b",
      accent: "border-l-[3px]",
    },
    ...(margin !== null
      ? [
          {
            icon: <BarChart2 size={16} />,
            label: "Expected Margin",
            value: `${margin.toFixed(1)} pts`,
            detail: `${winnerInfo.abbr} projected lead`,
            color: winnerInfo.color,
            accent: "border-l-[3px]",
          },
        ]
      : []),
    ...(score
      ? [
          {
            icon: <Zap size={16} />,
            label: "Total Points",
            value: `${score.predicted_total_points.toFixed(0)} pts`,
            detail: `Range: ${score.total_points_range[0]}–${score.total_points_range[1]}`,
            color: "#8b5cf6",
            accent: "border-l-[3px]",
          },
        ]
      : []),
    {
      icon: <Shield size={16} />,
      label: "Model Signal",
      value: result.final_display_recommendation?.primary_winner_signal || "WIN_PROB",
      detail: "Primary decision source",
      color: "#64748b",
      accent: "border-l-[3px]",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {signals.map((s, i) => (
        <div
          key={i}
          className={`signal-card animate-fade-in-up stagger-${Math.min(i + 1, 8)}`}
          style={{ borderLeftColor: s.color }}
        >
          <div className="flex items-center gap-2" style={{ color: s.color }}>
            {s.icon}
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{s.label}</span>
          </div>
          <p className="text-sm font-black text-slate-900 leading-tight font-mono" style={{ color: s.color }}>
            {s.value}
          </p>
          <p className="text-[10px] text-slate-400 font-medium">{s.detail}</p>
        </div>
      ))}
    </div>
  );
}

function NarrativeBlock({
  result,
  homeInfo,
  awayInfo,
  winnerInfo,
}: {
  result: any;
  homeInfo: { name: string; abbr: string; color: string };
  awayInfo: { name: string; abbr: string; color: string };
  winnerInfo: { name: string; abbr: string; color: string };
}) {
  const win = result.win_probability;
  const score = result.score_prediction;
  const prob = Math.max(win?.home_win_probability ?? 0, win?.away_win_probability ?? 0);
  const margin = score ? Math.abs(score.predicted_margin) : null;
  const loserInfo = winnerInfo.abbr === homeInfo.abbr ? awayInfo : homeInfo;
  const confidence = win?.confidence_bucket || "";
  const confStr = confidence.toUpperCase().includes("STRONG")
    ? "with strong conviction"
    : confidence.toUpperCase().includes("MODERATE")
    ? "with moderate confidence"
    : "in a lean projection";

  const narrative = `The model projects ${winnerInfo.name} to control this matchup ${confStr}, assigning a ${(prob * 100).toFixed(1)}% win probability. ${
    margin !== null
      ? `The expected winning margin of ${margin.toFixed(1)} points suggests ${winnerInfo.abbr} maintains a meaningful edge throughout, while ${loserInfo.abbr} will need to significantly outperform expectations to close the gap.`
      : `${loserInfo.name} will need to overcome the model's assessment to secure the win.`
  }${
    score
      ? ` Offensive efficiency and ${winnerInfo.abbr === homeInfo.abbr ? "home court advantage" : "road performance"} contribute significantly to the forecast.`
      : ""
  }`;

  return (
    <div
      className="narrative-block animate-fade-in-up stagger-3"
      style={{ borderLeftColor: winnerInfo.color }}
    >
      <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: winnerInfo.color }}>
        Predicted Game Script
      </p>
      <p className="text-sm text-slate-700 leading-relaxed font-medium">{narrative}</p>
    </div>
  );
}

function PlayerSpotlight({
  players,
  homeInfo,
  awayInfo,
}: {
  players: { home_players?: any[]; away_players?: any[] };
  homeInfo: { name: string; abbr: string; color: string };
  awayInfo: { name: string; abbr: string; color: string };
}) {
  const all = [
    ...(players.home_players?.map((p) => ({ ...p, teamAbbr: homeInfo.abbr, teamColor: homeInfo.color })) ?? []),
    ...(players.away_players?.map((p) => ({ ...p, teamAbbr: awayInfo.abbr, teamColor: awayInfo.color })) ?? []),
  ];

  if (all.length === 0) return null;

  const topScorer = [...all].sort((a, b) => b.predicted_pts - a.predicted_pts)[0];
  const topRebounder = [...all].sort((a, b) => b.predicted_reb - a.predicted_reb)[0];
  const topAssister = [...all].sort((a, b) => b.predicted_ast - a.predicted_ast)[0];

  const spotlights = [
    { player: topScorer, stat: topScorer?.predicted_pts, label: "Top Scorer", unit: "PTS", icon: <Trophy size={14} /> },
    { player: topRebounder, stat: topRebounder?.predicted_reb, label: "Top Rebounder", unit: "REB", icon: <Shield size={14} /> },
    { player: topAssister, stat: topAssister?.predicted_ast, label: "Top Assister", unit: "AST", icon: <Users size={14} /> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles size={14} className="text-violet-500" />
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Player Projection Spotlight</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {spotlights.map((s, i) => (
          <div key={i} className={`player-spotlight-card animate-fade-in-up stagger-${i + 2}`}>
            <div className="flex items-center gap-1.5 mb-3">
              <span style={{ color: s.player?.teamColor }}>{s.icon}</span>
              <span className="text-[9px] font-black uppercase tracking-widest text-white/40">{s.label}</span>
            </div>
            <p className="text-2xl font-black font-mono text-white leading-none">
              {s.stat?.toFixed(1)}
              <span className="text-xs font-bold text-white/40 ml-1">{s.unit}</span>
            </p>
            <p className="text-xs font-bold text-white/70 mt-2 leading-tight">{s.player?.player_name}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <span
                className="text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider"
                style={{ backgroundColor: `${s.player?.teamColor}30`, color: s.player?.teamColor }}
              >
                {s.player?.teamAbbr}
              </span>
              <span className="text-[9px] text-white/30 font-bold uppercase">{s.player?.position_group}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Full Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2">
        {[
          { label: awayInfo.abbr, color: awayInfo.color, players: players.away_players },
          { label: homeInfo.abbr, color: homeInfo.color, players: players.home_players },
        ].map((side) => (
          <div key={side.label}>
            <div className="flex items-center gap-2 mb-2">
              <TeamLogo abbr={side.label} name={side.label} size={18} />
              <h5 className="text-xs font-black uppercase tracking-wider" style={{ color: side.color }}>
                {side.label} Projections
              </h5>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200/70 shadow-sm text-xs">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200 text-left text-[9px] font-black uppercase tracking-widest text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Player</th>
                    <th className="px-2 py-2 text-right">Pos</th>
                    <th className="px-2 py-2 text-right text-slate-700">PTS</th>
                    <th className="px-2 py-2 text-right">REB</th>
                    <th className="px-2 py-2 text-right">AST</th>
                    <th className="px-3 py-2 text-right">PRA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {side.players?.map((p: any) => (
                    <tr key={p.player_id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-3 py-2 font-bold text-slate-800">{p.player_name}</td>
                      <td className="px-2 py-2 text-right text-[10px] uppercase font-semibold text-slate-400">{p.position_group}</td>
                      <td className="px-2 py-2 text-right font-black text-slate-900">{p.predicted_pts.toFixed(1)}</td>
                      <td className="px-2 py-2 text-right font-semibold text-slate-600">{p.predicted_reb.toFixed(1)}</td>
                      <td className="px-2 py-2 text-right font-semibold text-slate-600">{p.predicted_ast.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right font-black text-slate-700">{p.predicted_pra.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ModelDiagnostics({ modelStatus, result }: { modelStatus: any; result: any }) {
  const [open, setOpen] = useState(false);

  if (!modelStatus) return null;

  const winModel = modelStatus.win_model;
  const scoreModel = modelStatus.score_model;

  return (
    <div className="diagnostics-card animate-fade-in-up stagger-8">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-left"
        id="diagnostics-toggle"
      >
        <div className="flex items-center gap-2">
          <Cpu size={13} className="text-slate-400" />
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Model Diagnostics</span>
        </div>
        {open ? <ChevronUp size={14} className="text-slate-300" /> : <ChevronDown size={14} className="text-slate-300" />}
      </button>

      {open && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 animate-fade-in">
          {[
            { label: "ROC-AUC", value: winModel?.metrics?.roc_auc?.toFixed(4), color: "#10b981" },
            { label: "Accuracy", value: winModel?.metrics?.accuracy ? `${(winModel.metrics.accuracy * 100).toFixed(1)}%` : null, color: "#3b82f6" },
            { label: "Win Model", value: result?.win_probability?.model_version?.split("_").slice(-2).join(" ") || "v1", color: "#8b5cf6" },
            { label: "Score H-MAE", value: scoreModel?.metrics?.home_mae?.toFixed(2), color: "#f59e0b" },
            { label: "Score A-MAE", value: scoreModel?.metrics?.away_mae?.toFixed(2), color: "#f97316" },
          ]
            .filter((d) => d.value)
            .map((d, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-200/60 p-3 text-center">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{d.label}</p>
                <p className="text-sm font-black font-mono mt-1" style={{ color: d.color }}>
                  {d.value}
                </p>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function NbaPrediction() {
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [date, setDate] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [upcomingGames, setUpcomingGames] = useState<any[]>([]);
  const [scheduleGames, setScheduleGames] = useState<any[]>([]);
  const [gameResults, setGameResults] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  const [mode, setMode] = useState<"scheduled" | "custom">("scheduled");
  const [filterTeam1, setFilterTeam1] = useState("");
  const [filterTeam2, setFilterTeam2] = useState("");
  const [modelStatus, setModelStatus] = useState<any>(null);
  const [selectorOpen, setSelectorOpen] = useState(true);

  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        setLoadingData(true);
        const [gamesRes] = await Promise.all([fetch("/data/games.json").catch(() => null)]);
        if (gamesRes && gamesRes.ok) {
          const games = await gamesRes.json();
          const seen = new Set();
          const uniqueGames = games.filter((g: any) => {
            if (!g.GAME_ID || seen.has(g.GAME_ID)) return false;
            seen.add(g.GAME_ID);
            return true;
          });
          uniqueGames.sort((a: any, b: any) => b.GAME_DATE.localeCompare(a.GAME_DATE));
          setScheduleGames(uniqueGames);
          setUpcomingGames(uniqueGames.filter((g: any) => !(g.GAME_STATUS === "Final" || g.HOME_SCORE != null || g.AWAY_SCORE != null)));
          setGameResults(uniqueGames.filter((g: any) => g.GAME_STATUS === "Final" || g.HOME_SCORE != null || g.AWAY_SCORE != null));
        }
      } catch (err: any) {
        console.error("Error loading schedule data for predictions:", err);
        setDataError("Could not load game schedules. Manual inputs are still active.");
      } finally {
        setLoadingData(false);
      }
    };
    fetchDropdownData();
  }, []);

  useEffect(() => {
    const fetchModelStatus = async () => {
      try {
        const res = await fetch("http://localhost:8001/model-status");
        if (res.ok) setModelStatus(await res.json());
      } catch (err) {
        console.error("Error loading model status:", err);
      }
    };
    fetchModelStatus();
  }, []);

  const getTeamInfo = (abbr: string) =>
    NBA_TEAMS.find((t) => t.abbr === abbr) || { abbr, name: abbr, color: "#475569" };

  const teamAbbr = (abbr: string) => abbr?.toUpperCase?.() || "";

  const handleSelectGame = (game: any) => {
    setHome(game.HOME_TEAM_ABBREVIATION);
    setAway(game.AWAY_TEAM_ABBREVIATION);
    setDate(game.GAME_DATE);
    setResult(null);
    setError(null);
    setSelectorOpen(false);
  };

  const submit = useCallback(async () => {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      if (!home || !away) throw new Error("Please select both a home and away team.");
      if (home === away) throw new Error("Home and away teams cannot be the same.");
      if (!date) throw new Error("Please select a date for the matchup.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid date format. Please use YYYY-MM-DD.");

      const res = await fetch("http://localhost:8001/predict/game_full", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ home_team_id: home, away_team_id: away, prediction_date: date }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server returned ${res.status}`);
      }
      const data = await res.json();
      
      const normalized = {
        home_team: home,
        away_team: away,
        prediction_date: date,
        win_probability: {
          predicted_winner: data.win_probability.home_win_prob >= 0.5 ? home : away,
          home_win_probability: data.win_probability.home_win_prob,
          away_win_probability: data.win_probability.away_win_prob,
          confidence_bucket: Math.max(data.win_probability.home_win_prob, data.win_probability.away_win_prob) >= 0.7 ? "STRONG" : "MODERATE",
          model_version: "v4_full",
        },
        score_prediction: {
          predicted_home_score: data.score_prediction.home,
          home_score_range: data.score_prediction.home_range,
          predicted_away_score: data.score_prediction.away,
          away_score_range: data.score_prediction.away_range,
          predicted_total_points: data.score_prediction.total,
          total_points_range: data.score_prediction.total_range,
          predicted_margin: data.score_prediction.margin,
          margin_range: data.score_prediction.margin_range,
          score_model_winner: data.score_prediction.margin >= 0 ? home : away,
          model_version: data.score_prediction.model_version,
        },
        final_display_recommendation: {
          primary_winner_signal: "WIN_PROB",
        },
        player_predictions: {
          home_players: data.home_players.map((p: any) => ({
            player_id: p.player_name,
            player_name: p.player_name,
            position_group: p.position_group,
            predicted_pts: p.proj_pts,
            predicted_reb: p.proj_reb,
            predicted_ast: p.proj_ast,
            predicted_pra: p.proj_pra
          })),
          away_players: data.away_players.map((p: any) => ({
            player_id: p.player_name,
            player_name: p.player_name,
            position_group: p.position_group,
            predicted_pts: p.proj_pts,
            predicted_reb: p.proj_reb,
            predicted_ast: p.proj_ast,
            predicted_pra: p.proj_pra
          }))
        }
      };
      setResult(normalized);
      setSelectorOpen(false);
    } catch (e: any) {
      setError(e.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [home, away, date]);

  const filteredSchedule = scheduleGames.filter((g: any) => {
    if (!filterTeam1) return false;
    if (filterTeam1 && !filterTeam2) {
      return (
        g.HOME_TEAM_ABBREVIATION?.toUpperCase() === filterTeam1.toUpperCase() ||
        g.AWAY_TEAM_ABBREVIATION?.toUpperCase() === filterTeam1.toUpperCase()
      );
    }
    return (
      (g.HOME_TEAM_ABBREVIATION?.toUpperCase() === filterTeam1.toUpperCase() &&
        g.AWAY_TEAM_ABBREVIATION?.toUpperCase() === filterTeam2.toUpperCase()) ||
      (g.HOME_TEAM_ABBREVIATION?.toUpperCase() === filterTeam2.toUpperCase() &&
        g.AWAY_TEAM_ABBREVIATION?.toUpperCase() === filterTeam1.toUpperCase())
    );
  });

  const homeInfo = getTeamInfo(home);
  const awayInfo = getTeamInfo(away);

  const actualGame =
    mode === "scheduled"
      ? gameResults.find(
          (g: any) =>
            g.HOME_TEAM_ABBREVIATION?.toUpperCase() === home.toUpperCase() &&
            g.AWAY_TEAM_ABBREVIATION?.toUpperCase() === away.toUpperCase() &&
            g.GAME_DATE === date
        )
      : null;

  const hasActualResult = actualGame && actualGame.HOME_SCORE !== null && actualGame.AWAY_SCORE !== null;
  const isPredictionCorrect =
    result &&
    hasActualResult &&
    (result.win_probability?.predicted_winner || result.predicted_winner) === actualGame.WINNER_TEAM_ABBREVIATION;

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    try {
      return new Date(dateStr).toLocaleDateString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric" });
    } catch {
      return dateStr;
    }
  };

  const winnerAbbr = result?.win_probability?.predicted_winner || result?.predicted_winner;
  const winnerInfo = winnerAbbr ? getTeamInfo(winnerAbbr) : null;

  if (loadingData) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
        <RefreshCw size={28} className="animate-spin text-indigo-600" />
        <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Loading prediction engine...</span>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-5">

      {/* ── Data error notice ── */}
      {dataError && (
        <div className="flex items-start gap-3 rounded-xl bg-amber-50 text-amber-800 border border-amber-200/80 p-4 shadow-xs">
          <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs font-semibold m-0">{dataError}</p>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 1 — COMPACT SELECTION PANEL
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="surface rounded-[1.5rem] overflow-hidden">
        <div
          id="selector-toggle"
          onClick={() => setSelectorOpen((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-4 cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <Calendar size={15} className="text-slate-500" />
            <div className="text-left">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                Game Selection
              </p>
              {home && away && date ? (
                <p className="text-sm font-black text-slate-800 mt-0.5">
                  {homeInfo.name} vs {awayInfo.name} · {formatDate(date)}
                </p>
              ) : (
                <p className="text-sm font-black text-slate-400 mt-0.5">No game selected</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {home && away && date && !result && !loading && (
              <button
                onClick={(e) => { e.stopPropagation(); submit(); }}
                id="run-prediction-btn"
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-black uppercase tracking-wider transition-colors shadow-md shadow-indigo-200"
              >
                <Sparkles size={11} />
                Run Model
              </button>
            )}
            {selectorOpen ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
          </div>
        </div>

        {selectorOpen && (
          <div className="border-t border-slate-100 px-5 pb-5 pt-4 space-y-4 animate-fade-in">
            {/* Mode tabs */}
            <div className="flex border border-slate-200 bg-slate-50 p-1 rounded-xl w-fit gap-1">
              {(["scheduled", "custom"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setResult(null); setError(null); }}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-200 ${
                    mode === m
                      ? "bg-white text-slate-900 shadow-xs border border-slate-200/50"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {m === "scheduled" ? "Scheduled Games" : "Custom Matchup"}
                </button>
              ))}
            </div>

            {/* Scheduled mode */}
            {mode === "scheduled" && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Upcoming games quick list */}
                {upcomingGames.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Upcoming Games</p>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                      {upcomingGames.map((g: any) => {
                        const isSelected = home === g.HOME_TEAM_ABBREVIATION && away === g.AWAY_TEAM_ABBREVIATION && date === g.GAME_DATE;
                        return (
                          <button
                            key={g.GAME_ID}
                            onClick={() => handleSelectGame(g)}
                            className={`w-full text-left p-3 rounded-xl border transition-all duration-200 flex items-center justify-between gap-3 ${
                              isSelected
                                ? "bg-indigo-50/60 border-indigo-400 shadow-xs"
                                : "bg-white border-slate-200/80 hover:border-slate-300"
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="flex items-center -space-x-1">
                                <TeamLogo abbr={teamAbbr(g.HOME_TEAM_ABBREVIATION)} name={g.HOME_TEAM_ABBREVIATION} size={20} />
                                <TeamLogo abbr={teamAbbr(g.AWAY_TEAM_ABBREVIATION)} name={g.AWAY_TEAM_ABBREVIATION} size={20} />
                              </div>
                              <span className="text-xs font-black text-slate-800">
                                {g.HOME_TEAM_ABBREVIATION} vs {g.AWAY_TEAM_ABBREVIATION}
                              </span>
                              <span className="text-[9px] font-bold text-slate-400 uppercase">{g.SEASON_TYPE}</span>
                            </div>
                            <span className="text-[10px] font-mono text-slate-400 font-bold">{g.GAME_DATE}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Filter by team */}
                <div className="space-y-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Filter by Team</p>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:outline-none shadow-xs"
                      value={filterTeam1}
                      onChange={(e) => { setFilterTeam1(e.target.value); if (!e.target.value) setFilterTeam2(""); }}
                    >
                      <option value="">Team 1</option>
                      {NBA_TEAMS.map((t) => <option key={t.abbr} value={t.abbr}>{t.abbr} — {t.name}</option>)}
                    </select>
                    <select
                      className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:outline-none shadow-xs disabled:opacity-50"
                      value={filterTeam2}
                      onChange={(e) => setFilterTeam2(e.target.value)}
                      disabled={!filterTeam1}
                    >
                      <option value="">Team 2 (optional)</option>
                      {NBA_TEAMS.map((t) => <option key={t.abbr} value={t.abbr} disabled={t.abbr === filterTeam1}>{t.abbr} — {t.name}</option>)}
                    </select>
                  </div>
                  <div className="border border-slate-200/80 rounded-xl overflow-hidden bg-white shadow-xs max-h-44 overflow-y-auto divide-y divide-slate-100">
                    {!filterTeam1 ? (
                      <div className="p-4 text-center text-xs text-slate-400 font-semibold">Select a team to filter games</div>
                    ) : filteredSchedule.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400 font-semibold">No matchups found</div>
                    ) : (
                      filteredSchedule.map((g: any) => {
                        const isSelected = home === g.HOME_TEAM_ABBREVIATION && away === g.AWAY_TEAM_ABBREVIATION && date === g.GAME_DATE;
                        return (
                          <button
                            key={g.GAME_ID}
                            onClick={() => handleSelectGame(g)}
                            className={`w-full text-left px-3.5 py-2 hover:bg-slate-50 transition-colors flex items-center justify-between text-xs ${isSelected ? "bg-indigo-50/30 text-indigo-900 font-bold" : "text-slate-600 font-medium"}`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold">{g.HOME_TEAM_ABBREVIATION}</span>
                              <span className="text-slate-300">vs</span>
                              <span className="font-extrabold">{g.AWAY_TEAM_ABBREVIATION}</span>
                              <span className="text-[8px] uppercase font-black tracking-wider text-slate-400 px-1 py-0.5 bg-slate-50 border border-slate-150 rounded">
                                {g.SEASON_TYPE === "NBA Finals" ? "Finals" : "Regular"}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-bold font-mono">{g.GAME_DATE}</span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Custom mode */}
            {mode === "custom" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">Home Team</label>
                  <select
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:outline-none shadow-xs"
                    value={home}
                    onChange={(e) => { setHome(e.target.value); setResult(null); setError(null); }}
                  >
                    <option value="">Select Home</option>
                    {NBA_TEAMS.map((t) => <option key={t.abbr} value={t.abbr}>{t.abbr} — {t.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">Away Team</label>
                  <select
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:outline-none shadow-xs"
                    value={away}
                    onChange={(e) => { setAway(e.target.value); setResult(null); setError(null); }}
                  >
                    <option value="">Select Away</option>
                    {NBA_TEAMS.map((t) => <option key={t.abbr} value={t.abbr} disabled={t.abbr === home}>{t.abbr} — {t.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">Date</label>
                  <input
                    type="date"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:outline-none shadow-xs"
                    value={date}
                    onChange={(e) => { setDate(e.target.value); setResult(null); setError(null); }}
                  />
                </div>
              </div>
            )}

            {/* CTA */}
            {home && away && date && (
              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={submit}
                  disabled={loading}
                  id="run-prediction-main-btn"
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-black uppercase tracking-wider transition-colors shadow-md shadow-indigo-200"
                >
                  {loading ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  {loading ? "Analyzing..." : "Run Prediction Model"}
                </button>
                {result && (
                  <button
                    onClick={submit}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 hover:border-slate-300 bg-white text-slate-600 text-[11px] font-bold uppercase tracking-wider transition-colors"
                  >
                    <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
                    Refresh
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="p-4 bg-rose-50 text-rose-700 rounded-xl border border-rose-200 text-xs font-semibold flex items-center gap-2 animate-fade-in">
          <AlertTriangle size={14} />
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="surface rounded-[1.5rem] p-12 flex flex-col items-center justify-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-4 border-indigo-100" />
            <div className="w-16 h-16 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin absolute inset-0" />
          </div>
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Analyzing matchup statistics...</p>
        </div>
      )}

      {/* Empty state */}
      {!home || !away || !date ? (
        <div className="surface rounded-[1.5rem] p-14 text-center flex flex-col items-center justify-center gap-4 min-h-[300px]">
          <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center">
            <Activity size={28} className="text-slate-300 animate-pulse" />
          </div>
          <div>
            <h4 className="text-sm font-black text-slate-700 uppercase tracking-widest">Select a Matchup</h4>
            <p className="text-xs text-slate-400 mt-2 max-w-sm mx-auto leading-relaxed">
              Choose a scheduled game or build a custom matchup using the controls above to run the prediction engine.
            </p>
          </div>
        </div>
      ) : null}

      {/* ═══════════════════════════════════════════════════════════════════
          RESULT SECTIONS — only shown when result is available
      ═══════════════════════════════════════════════════════════════════ */}
      {result && !loading && (
        <div className="space-y-5">

          {/* Partial failure warnings */}
          {(result.win_probability?.error || result.score_prediction?.error) && (
            <div className="p-4 bg-amber-50 border border-amber-200/50 rounded-2xl text-xs text-amber-800 font-semibold space-y-1.5">
              {result.win_probability?.error && (
                <p className="flex items-center gap-1.5 m-0">
                  <AlertTriangle size={13} className="text-amber-600" />
                  Win Probability Model: {result.win_probability.error}
                </p>
              )}
              {result.score_prediction?.error && (
                <p className="flex items-center gap-1.5 m-0">
                  <AlertTriangle size={13} className="text-amber-600" />
                  Score Prediction Model: {result.score_prediction.error}
                </p>
              )}
            </div>
          )}

          {/* ── SECTION 2: HERO PREDICTION CARD ── */}
          {result.win_probability && !result.win_probability.error && winnerInfo && (
            <div className="prediction-hero rounded-[2rem] overflow-hidden relative animate-scale-in">
              {/* Team color bleeds */}
              <div
                className="absolute inset-y-0 left-0 w-1/3 opacity-20 pointer-events-none"
                style={{ background: `radial-gradient(ellipse at left center, ${awayInfo.color}, transparent 70%)` }}
              />
              <div
                className="absolute inset-y-0 right-0 w-1/3 opacity-20 pointer-events-none"
                style={{ background: `radial-gradient(ellipse at right center, ${homeInfo.color}, transparent 70%)` }}
              />
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

              <div className="relative p-6 lg:p-8">
                {/* Header row */}
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-2">
                    <Cpu size={12} className="text-white/30" />
                    <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30">
                      NBA Prediction Engine
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar size={11} className="text-white/30" />
                    <span className="text-[9px] font-mono font-bold text-white/30">{formatDate(date)}</span>
                  </div>
                </div>

                {/* Main hero area: Away | Arc Gauge | Home */}
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 lg:gap-8">
                  {/* Away team */}
                  <div className="text-center space-y-3">
                    <div className="flex justify-center">
                      <div
                        className="w-20 h-20 rounded-2xl flex items-center justify-center ring-2 ring-white/10 shadow-xl"
                        style={{ backgroundColor: `${awayInfo.color}22`, borderColor: `${awayInfo.color}44` }}
                      >
                        <TeamLogo abbr={teamAbbr(awayInfo.abbr)} name={awayInfo.name} size={56} />
                      </div>
                    </div>
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Away</p>
                      <h2
                        className="text-xl font-black uppercase tracking-tight text-white leading-tight mt-1"
                        style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                      >
                        {awayInfo.name}
                      </h2>
                      <p className="text-3xl font-black font-mono mt-2" style={{ color: awayInfo.color }}>
                        {(result.win_probability.away_win_probability * 100).toFixed(1)}%
                      </p>
                      <p className="text-[9px] font-bold text-white/30 uppercase tracking-wider mt-1">Win Probability</p>
                    </div>
                    {result.win_probability.predicted_winner === awayInfo.abbr && (
                      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 winner-pulse">
                        <Trophy size={11} className="text-emerald-400" />
                        <span className="text-[10px] font-black text-emerald-400 uppercase tracking-wider">Predicted Winner</span>
                      </div>
                    )}
                  </div>

                  {/* Center: Arc gauge */}
                  <div className="flex flex-col items-center gap-2">
                    <WinProbabilityArc
                      homeProb={result.win_probability.home_win_probability}
                      awayProb={result.win_probability.away_win_probability}
                      homeColor={homeInfo.color}
                      awayColor={awayInfo.color}
                      homeAbbr={homeInfo.abbr}
                      awayAbbr={awayInfo.abbr}
                      confidence={result.win_probability.confidence_bucket || ""}
                      margin={result.score_prediction?.predicted_margin ?? 0}
                      winnerAbbr={winnerInfo.abbr}
                    />
                    {/* Confidence badge */}
                    <div
                      className="px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest"
                      style={{
                        backgroundColor:
                          result.win_probability.confidence_bucket?.toUpperCase().includes("STRONG")
                            ? "rgba(16,185,129,0.15)"
                            : result.win_probability.confidence_bucket?.toUpperCase().includes("MODERATE")
                            ? "rgba(59,130,246,0.15)"
                            : "rgba(245,158,11,0.15)",
                        borderColor:
                          result.win_probability.confidence_bucket?.toUpperCase().includes("STRONG")
                            ? "rgba(16,185,129,0.3)"
                            : result.win_probability.confidence_bucket?.toUpperCase().includes("MODERATE")
                            ? "rgba(59,130,246,0.3)"
                            : "rgba(245,158,11,0.3)",
                        color:
                          result.win_probability.confidence_bucket?.toUpperCase().includes("STRONG")
                            ? "#10b981"
                            : result.win_probability.confidence_bucket?.toUpperCase().includes("MODERATE")
                            ? "#60a5fa"
                            : "#fbbf24",
                      }}
                    >
                      {result.win_probability.confidence_bucket || "MEDIUM"}
                    </div>
                  </div>

                  {/* Home team */}
                  <div className="text-center space-y-3">
                    <div className="flex justify-center">
                      <div
                        className="w-20 h-20 rounded-2xl flex items-center justify-center ring-2 ring-white/10 shadow-xl"
                        style={{ backgroundColor: `${homeInfo.color}22`, borderColor: `${homeInfo.color}44` }}
                      >
                        <TeamLogo abbr={teamAbbr(homeInfo.abbr)} name={homeInfo.name} size={56} />
                      </div>
                    </div>
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Home</p>
                      <h2
                        className="text-xl font-black uppercase tracking-tight text-white leading-tight mt-1"
                        style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                      >
                        {homeInfo.name}
                      </h2>
                      <p className="text-3xl font-black font-mono mt-2" style={{ color: homeInfo.color }}>
                        {(result.win_probability.home_win_probability * 100).toFixed(1)}%
                      </p>
                      <p className="text-[9px] font-bold text-white/30 uppercase tracking-wider mt-1">Win Probability</p>
                    </div>
                    {result.win_probability.predicted_winner === homeInfo.abbr && (
                      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 winner-pulse">
                        <Trophy size={11} className="text-emerald-400" />
                        <span className="text-[10px] font-black text-emerald-400 uppercase tracking-wider">Predicted Winner</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom KPI strip */}
                {result.score_prediction && !result.score_prediction.error && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8 pt-6 border-t border-white/08">
                    {[
                      {
                        label: "Predicted Score",
                        value: `${result.score_prediction.predicted_home_score?.toFixed(0)} – ${result.score_prediction.predicted_away_score?.toFixed(0)}`,
                        sub: `${homeInfo.abbr} – ${awayInfo.abbr}`,
                      },
                      {
                        label: "Expected Margin",
                        value: `${Math.abs(result.score_prediction.predicted_margin).toFixed(1)} pts`,
                        sub: `${winnerInfo.abbr} lead`,
                      },
                      {
                        label: "Total Points",
                        value: `${result.score_prediction.predicted_total_points?.toFixed(0)} pts`,
                        sub: `${result.score_prediction.total_points_range?.[0]}–${result.score_prediction.total_points_range?.[1]} range`,
                      },
                      {
                        label: "Confidence",
                        value: result.win_probability.confidence_bucket || "MEDIUM",
                        sub: "Model signal strength",
                      },
                    ].map((kpi, i) => (
                      <div key={i} className="text-center p-3 rounded-xl bg-white/04 border border-white/06">
                        <p className="text-[9px] font-black uppercase tracking-widest text-white/30">{kpi.label}</p>
                        <p
                          className="text-sm font-black text-white mt-1.5 font-mono"
                          style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "1rem" }}
                        >
                          {kpi.value}
                        </p>
                        <p className="text-[9px] text-white/25 font-bold mt-1">{kpi.sub}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── SECTION 3: SIGNAL INSIGHT CARDS ── */}
          {result.win_probability && !result.win_probability.error && winnerInfo && (
            <div className="space-y-3 animate-fade-in-up stagger-2">
              <div className="flex items-center gap-2">
                <Zap size={13} className="text-indigo-500" />
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  Why the Model Favors {winnerInfo.name}
                </p>
              </div>
              <SignalCards result={result} homeInfo={homeInfo} awayInfo={awayInfo} winnerInfo={winnerInfo} />
            </div>
          )}

          {/* ── SECTION 4: NARRATIVE GAME SCRIPT ── */}
          {result.win_probability && !result.win_probability.error && winnerInfo && (
            <NarrativeBlock result={result} homeInfo={homeInfo} awayInfo={awayInfo} winnerInfo={winnerInfo} />
          )}

          {/* ── SECTION 5: PLAYER SPOTLIGHT + TABLES ── */}
          {result.player_predictions && !result.player_predictions.error && (
            <div className="surface rounded-[1.5rem] p-5 lg:p-6 animate-fade-in-up stagger-4">
              <PlayerSpotlight
                players={result.player_predictions}
                homeInfo={homeInfo}
                awayInfo={awayInfo}
              />
            </div>
          )}

          {/* ── SECTION 7: SCORE PREDICTION PANEL ── */}
          {result.score_prediction && !result.score_prediction.error && (
            <div className="surface rounded-[1.5rem] p-5 lg:p-6 space-y-4 animate-fade-in-up stagger-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Score Prediction</p>
                  <h3 className="text-base font-black text-slate-800 mt-0.5" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                    80% Confidence Score Ranges
                  </h3>
                </div>
                <span className="text-[9px] font-black uppercase px-2.5 py-1 rounded bg-slate-100 text-slate-500 border border-slate-200 font-mono">
                  {result.score_prediction.model_version || "score_v2"}
                </span>
              </div>

              {/* Score boxes */}
              <div className="grid grid-cols-2 gap-4">
                {[
                  { team: awayInfo, score: result.score_prediction.predicted_away_score, range: result.score_prediction.away_score_range },
                  { team: homeInfo, score: result.score_prediction.predicted_home_score, range: result.score_prediction.home_score_range },
                ].map((s) => (
                  <div key={s.team.abbr} className="score-box">
                    <div className="flex items-center justify-center gap-2 mb-3">
                      <TeamLogo abbr={teamAbbr(s.team.abbr)} name={s.team.name} size={24} />
                      <p className="text-xs font-black text-slate-600">{s.team.abbr}</p>
                      <span className="text-[9px] text-slate-400 font-bold uppercase">
                        {s.team.abbr === homeInfo.abbr ? "Home" : "Away"}
                      </span>
                    </div>
                    <p className="text-4xl font-black font-mono" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: s.team.color }}>
                      {s.score?.toFixed(0)}
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono font-bold mt-2">
                      Range: {s.range?.[0]} – {s.range?.[1]} pts
                    </p>
                    {/* Mini range track */}
                    <div className="mt-3 h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      {(() => {
                        const minV = 80, maxV = 140;
                        const rS = Math.max(0, Math.min(100, ((s.range?.[0] - minV) / (maxV - minV)) * 100));
                        const rE = Math.max(0, Math.min(100, ((s.range?.[1] - minV) / (maxV - minV)) * 100));
                        const pP = Math.max(0, Math.min(100, ((s.score - minV) / (maxV - minV)) * 100));
                        return (
                          <div className="relative h-full">
                            <div className="absolute h-full opacity-30 rounded-full" style={{ left: `${rS}%`, width: `${rE - rS}%`, backgroundColor: s.team.color }} />
                            <div className="absolute h-full w-1.5 rounded-full" style={{ left: `${pP}%`, backgroundColor: s.team.color, boxShadow: `0 0 6px ${s.team.color}80` }} />
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                ))}
              </div>

              {/* Total + Margin */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 bg-slate-50 border border-slate-200/60 rounded-2xl">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Expected Total Points</p>
                  <p className="text-xl font-black text-slate-900 mt-1.5 font-mono">
                    {result.score_prediction.predicted_total_points.toFixed(1)} pts
                  </p>
                  <p className="text-[9px] font-mono font-bold text-slate-400 mt-1">
                    Range: {result.score_prediction.total_points_range[0]} – {result.score_prediction.total_points_range[1]}
                  </p>
                </div>
                <div className="p-4 bg-slate-50 border border-slate-200/60 rounded-2xl">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Expected Point Margin</p>
                  <p className="text-xl font-black text-slate-900 mt-1.5 font-mono">
                    {Math.abs(result.score_prediction.predicted_margin).toFixed(1)} pts
                  </p>
                  <p className="text-[9px] font-mono font-bold text-slate-400 mt-1">
                    {result.score_prediction.predicted_margin >= 0 ? homeInfo.abbr : awayInfo.abbr} Lead ·{" "}
                    {result.score_prediction.margin_range[0]} to {result.score_prediction.margin_range[1]}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── SECTION 9: MODEL VS ACTUAL VERDICT ── */}
          {hasActualResult && (
            <div className={isPredictionCorrect ? "verdict-card-correct animate-fade-in-up stagger-6" : "verdict-card-wrong animate-fade-in-up stagger-6"}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Activity size={14} className={isPredictionCorrect ? "text-emerald-600" : "text-rose-500"} />
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Model vs Actual Outcome</p>
                </div>
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase border ${isPredictionCorrect ? "bg-emerald-100 text-emerald-700 border-emerald-300" : "bg-rose-100 text-rose-700 border-rose-300"}`}>
                  {isPredictionCorrect ? "Correct Prediction" : "Incorrect Prediction"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 bg-white/60 rounded-xl border border-white/80">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Model Predicted</p>
                  <div className="flex items-center gap-2.5">
                    <TeamLogo abbr={teamAbbr(result.win_probability?.predicted_winner || result.predicted_winner)} name={getTeamInfo(result.win_probability?.predicted_winner || result.predicted_winner).name} size={28} />
                    <div>
                      <p className="text-xs font-black text-slate-800">{getTeamInfo(result.win_probability?.predicted_winner || result.predicted_winner).abbr} to Win</p>
                      {result.win_probability && (
                        <p className="text-[10px] font-bold text-slate-400 mt-0.5 font-mono">
                          {(Math.max(result.win_probability.home_win_probability, result.win_probability.away_win_probability) * 100).toFixed(1)}% prob
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="p-4 bg-white/60 rounded-xl border border-white/80">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Actual Outcome</p>
                  <div className="flex items-center gap-2.5">
                    <TeamLogo abbr={teamAbbr(actualGame.WINNER_TEAM_ABBREVIATION)} name={getTeamInfo(actualGame.WINNER_TEAM_ABBREVIATION).name} size={28} />
                    <div>
                      <p className="text-xs font-black text-slate-800">
                        {getTeamInfo(actualGame.WINNER_TEAM_ABBREVIATION).abbr} Won {actualGame.HOME_SCORE} – {actualGame.AWAY_SCORE}
                      </p>
                      <p className="text-[10px] font-bold text-slate-400 mt-0.5 font-mono uppercase">
                        {actualGame.GAME_STATUS || "Final"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── SECTION 8: MODEL DIAGNOSTICS (collapsed) ── */}
          <ModelDiagnostics modelStatus={modelStatus} result={result} />

          {/* Disclaimer */}
          <div className="p-4 rounded-xl border border-slate-200/50 bg-slate-50/60 text-[10px] text-slate-400 font-medium leading-relaxed animate-fade-in-up stagger-8">
            <span className="font-black text-slate-500">Disclaimer:</span> Statistical model output — not a guaranteed result. Score predictions have high natural variance. Use win probability as your primary signal.
            {result.final_display_recommendation?.warning && (
              <span className="block mt-1 text-amber-600 font-semibold">{result.final_display_recommendation.warning}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
