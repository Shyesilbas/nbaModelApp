import { useState, useEffect, useMemo } from "react";
import {
  Search,
  Layers,
  Trophy,
  RefreshCw,
  Activity,
  Cpu,
  BarChart2,
} from "lucide-react";
import GameResults from "./components/GameResults";
import SeasonStats from "./components/SeasonStats";
import TeamExplorer from "./components/TeamExplorer";
import CorePlayers from "./components/CorePlayers";
import StarCandidates from "./components/StarCandidates";
import MultiTeamPlayers from "./components/MultiTeamPlayers";
import DatasetHealth from "./components/DatasetHealth";
import FutureModeling from "./components/FutureModeling";
import NbaPrediction from "./components/NbaPrediction";
import TeamLogo from "./components/TeamLogo";
import { TEAM_NAME_BY_ABBR } from "./lib/nbaTeams";

const MENU = [
  { id: "game-results",  label: "Game Results",     icon: <Trophy size={16} />,          section: null },
  { id: "season-stats",  label: "Season Stats",     icon: <BarChart2 size={16} />,       section: null },
  { id: "team-explorer", label: "Team Explorer",    icon: <Search size={16} />,          section: "ANALYSIS" },
  { id: "core-players",  label: "Core Players",     icon: <Layers size={16} />,          section: null },
  { id: "star-candidates",label:"Star Candidates",  icon: <Trophy size={16} />,          section: null },
  { id: "multi-team",    label: "Trade Discovery",  icon: <RefreshCw size={16} />,       section: null },
  { id: "dataset-health",label:"Data Quality",    icon: <Activity size={16} />,        section: "PIPELINE" },
  { id: "nba-prediction",label:"Predictions",     icon: <BarChart2 size={16} />,       section: "MODELS" },
  { id: "future-modeling",label:"Model Roadmap",     icon: <Cpu size={16} />,             section: null },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("game-results");

  // Shared data states
  const [summary, setSummary]           = useState<any>(null);
  const [rosters, setRosters]           = useState<any[]>([]);
  const [corePlayers, setCorePlayers]   = useState<any[]>([]);
  const [starCandidates, setStarCandidates] = useState<any[]>([]);
  const [multiTeamPlayers, setMultiTeamPlayers] = useState<any[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [sumRes, rostRes, coreRes, starRes, multiRes] = await Promise.all([
          fetch("/data/dataset_summary.json"),
          fetch("/data/team_rosters.json"),
          fetch("/data/core_players.json"),
          fetch("/data/star_candidates.json"),
          fetch("/data/multi_team_players.json"),
        ]);
        if (!sumRes.ok) throw new Error("Failed to load dataset_summary.json");
        setSummary(await sumRes.json());
        setRosters(await rostRes.json());
        setCorePlayers(await coreRes.json());
        setStarCandidates(await starRes.json());
        setMultiTeamPlayers(await multiRes.json());
        setLoading(false);
      } catch (e: any) {
        setError(e.message);
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  const activeLabel = useMemo(() => MENU.find((m) => m.id === activeTab)?.label ?? "Dashboard", [activeTab]);

  return (
    <div className="min-h-screen text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1800px] gap-6 p-4 lg:p-6">
        <aside className="sticky top-4 hidden h-[calc(100vh-2rem)] w-72 shrink-0 flex-col overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white text-slate-900 shadow-[0_20px_70px_rgba(15,23,42,0.08)] lg:flex">
          <div className="border-b border-slate-200/80 bg-slate-50/60 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white ring-1 ring-slate-900/10">
                <BarChart2 size={20} className="text-white" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">NBA Intel</p>
                <p className="mt-1 text-sm font-semibold text-slate-700">Model dashboard</p>
              </div>
            </div>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto p-3">
            {MENU.map((item) => (
              <div key={item.id}>
                {item.section && (
                  <p className="px-3 pb-2 pt-4 text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">
                    {item.section}
                  </p>
                )}
                <button
                  onClick={() => setActiveTab(item.id)}
                  className={activeTab === item.id ? "nav-btn-active nav-btn" : "nav-btn"}
                >
                  <span className={activeTab === item.id ? "text-white" : "text-slate-400"}>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              </div>
            ))}
          </nav>

          <div className="border-t border-slate-200/80 p-4">
            <div className="rounded-[1.5rem] bg-slate-50 p-4 ring-1 ring-slate-200/80">
              <div className="flex items-center gap-3">
                <TeamLogo abbr="GSW" name={TEAM_NAME_BY_ABBR.GSW} size={40} />
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">Season status</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">Season data synced</p>
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-slate-500">
                Team logos now load from ESPN CDN, with a clean fallback for unsupported cases.
              </p>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="surface mb-6 flex flex-col gap-4 rounded-[2rem] px-5 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-6">
            <div className="flex items-center gap-3">
              <TeamLogo abbr="GSW" name={TEAM_NAME_BY_ABBR.GSW} size={44} />
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Current view</p>
                <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 lg:text-3xl" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                  {activeLabel}
                </h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.24em] text-slate-600">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                Season live
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
              </div>
            </div>
          </header>

          <div className="py-6">
          {loading ? (
              <div className="flex h-72 flex-col items-center justify-center gap-4">
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-900 border-t-transparent" />
                <p className="text-[10px] font-black uppercase tracking-[0.32em] text-slate-400">Loading stats and models...</p>
              </div>
          ) : error ? (
              <div className="mx-auto flex max-w-lg flex-col items-center justify-center gap-4 rounded-[2rem] border border-rose-200 bg-white p-8 text-center shadow-lg">
                <div className="rounded-2xl bg-rose-50 p-4 text-rose-600">
                  <RefreshCw size={28} className="animate-spin" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-900">Failed to load data</h2>
                  <p className="mt-2 text-sm text-slate-500">{error}</p>
                </div>
                <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-[11px] text-slate-500">
                  python3 scripts/export_frontend_data.py
                </p>
              </div>
          ) : (
              <div className="space-y-6">
                {activeTab === "game-results" && <GameResults />}
                {activeTab === "season-stats" && <SeasonStats />}
                {activeTab === "team-explorer" && <TeamExplorer rosters={rosters} />}
                {activeTab === "core-players" && <CorePlayers corePlayers={corePlayers} rosters={rosters} />}
                {activeTab === "star-candidates" && <StarCandidates candidates={starCandidates} />}
                {activeTab === "multi-team" && <MultiTeamPlayers players={multiTeamPlayers} />}
                {activeTab === "dataset-health" && <DatasetHealth filesStatus={summary?.files_status ?? null} />}
                {activeTab === "future-modeling" && <FutureModeling />}
                {activeTab === "nba-prediction" && <NbaPrediction />}
              </div>
          )}
          </div>
        </main>
      </div>
    </div>
  );
}
