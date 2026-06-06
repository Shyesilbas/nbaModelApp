import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Search,
  Layers,
  Trophy,
  RefreshCw,
  Activity,
  Cpu,
  BarChart2,
  Calendar,
} from "lucide-react";
import Overview from "./components/Overview";
import Schedule from "./components/Schedule";
import GameResults from "./components/GameResults";
import TeamExplorer from "./components/TeamExplorer";
import CorePlayers from "./components/CorePlayers";
import StarCandidates from "./components/StarCandidates";
import MultiTeamPlayers from "./components/MultiTeamPlayers";
import DatasetHealth from "./components/DatasetHealth";
import FutureModeling from "./components/FutureModeling";

const MENU = [
  { id: "overview",      label: "Overview",        icon: <LayoutDashboard size={16} />, section: null },
  { id: "schedule",      label: "NBA Finals",      icon: <Calendar size={16} />,        section: "SEASON" },
  { id: "game-results",  label: "Game Results",     icon: <Trophy size={16} />,          section: null },
  { id: "team-explorer", label: "Team Explorer",    icon: <Search size={16} />,          section: "ANALYSIS" },
  { id: "core-players",  label: "Core Players",     icon: <Layers size={16} />,          section: null },
  { id: "star-candidates",label:"Star Candidates",  icon: <Trophy size={16} />,          section: null },
  { id: "multi-team",    label: "Trade Discovery",  icon: <RefreshCw size={16} />,       section: null },
  { id: "dataset-health",label:"Data Quality",    icon: <Activity size={16} />,        section: "PIPELINE" },
  { id: "future-modeling",label:"Model Roadmap",     icon: <Cpu size={16} />,             section: null },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("overview");

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

  // Group menu items by section headers
  const sections: { header: string | null; items: typeof MENU }[] = [];
  let currentHeader: string | null = "__NONE__";
  MENU.forEach(item => {
    const h = item.section ?? null;
    if (h !== currentHeader && h !== null) {
      sections.push({ header: h, items: [] });
      currentHeader = h;
    } else if (sections.length === 0 || (h === null && sections[sections.length - 1].header !== null && sections.length > 0 && h !== currentHeader)) {
      // ensure flat items go in a null-header group
    }
    if (sections.length === 0) sections.push({ header: null, items: [] });
    sections[sections.length - 1].items.push(item);
  });

  return (
    <div className="flex min-h-screen bg-[#f8fafc] text-slate-800 antialiased">
      {/* ── Sidebar ──────────────────────────────────────────── */}
      <aside className="w-60 fixed h-full z-30 flex flex-col bg-white border-r border-slate-200">

        {/* Logo */}
        <div className="px-5 py-5 flex items-center gap-2.5 border-b border-slate-100">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#1d428a]"
            style={{ boxShadow: "0 2px 8px rgba(29,66,138,0.2)" }}>
            <BarChart2 size={16} className="text-white" />
          </div>
          <div>
            <p className="text-xs font-black text-slate-900 uppercase tracking-[0.15em] leading-none">NBA Intel</p>
            <p className="text-[9px] text-slate-400 font-semibold mt-0.5 tracking-wider">Stats & Metrics</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {/* Simple flat menu — render section labels on first item of each group */}
          {(() => {
            let lastSection: string | null = undefined as any;
            return MENU.map(item => {
              const showHeader = item.section !== null && item.section !== lastSection;
              lastSection = item.section ?? lastSection;
              return (
                <div key={item.id}>
                  {showHeader && (
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] px-3 pt-4 pb-1.5">
                      {item.section}
                    </p>
                  )}
                  <button
                    onClick={() => setActiveTab(item.id)}
                    className={activeTab === item.id ? "nav-btn-active" : "nav-btn"}
                  >
                    <span className={activeTab === item.id ? "text-[#1d428a]" : "text-slate-400"}>
                      {item.icon}
                    </span>
                    {item.label}
                  </button>
                </div>
              );
            });
          })()}
        </nav>

        {/* Footer status */}
        <div className="px-4 py-4 border-t border-slate-100 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Database Status</span>
            <span className="text-[9px] font-bold text-emerald-600">Ready</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Active Season</span>
            <span className="text-[9px] font-bold text-slate-600">2025-26</span>
          </div>
          <p className="text-[8px] text-slate-400 leading-normal">
            All team stats and schedule information fully synced.
          </p>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────── */}
      <main className="ml-60 flex-1 min-h-screen relative overflow-hidden">
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(rgba(15,23,42,0.02) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />

        {/* Top bar */}
        <header className="relative z-10 flex items-center justify-between px-8 py-4 border-b border-slate-200 bg-white/80 backdrop-blur">
          <div>
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
              {MENU.find(m => m.id === activeTab)?.label ?? "Dashboard"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-[10px] font-bold text-slate-600 shadow-sm">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              2025-26 Season
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="relative z-10 p-8">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#1d428a] border-t-transparent" />
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Loading Stats & Models...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4 text-center max-w-md mx-auto">
              <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100">
                <RefreshCw size={28} className="text-rose-500 mx-auto animate-spin" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-800 mb-1">Failed to Load</h2>
                <p className="text-xs text-slate-500">{error}</p>
              </div>
              <p className="text-[10px] text-slate-500 font-mono bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-sm">
                python3 scripts/export_frontend_data.py
              </p>
            </div>
          ) : (
            <div className="max-w-7xl mx-auto">
              {activeTab === "overview"        && <Overview summary={summary} />}
              {activeTab === "schedule"        && <Schedule />}
              {activeTab === "game-results"    && <GameResults />}
              {activeTab === "team-explorer"   && <TeamExplorer rosters={rosters} />}
              {activeTab === "core-players"    && <CorePlayers corePlayers={corePlayers} />}
              {activeTab === "star-candidates" && <StarCandidates candidates={starCandidates} />}
              {activeTab === "multi-team"      && <MultiTeamPlayers players={multiTeamPlayers} />}
              {activeTab === "dataset-health"  && <DatasetHealth filesStatus={summary?.files_status ?? null} />}
              {activeTab === "future-modeling" && <FutureModeling />}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
