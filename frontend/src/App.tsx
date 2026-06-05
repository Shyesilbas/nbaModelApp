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
  { id: "schedule",      label: "Schedule",         icon: <Calendar size={16} />,        section: "SEASON" },
  { id: "game-results",  label: "Game Results",     icon: <Trophy size={16} />,          section: null },
  { id: "team-explorer", label: "Team Explorer",    icon: <Search size={16} />,          section: "ANALYSIS" },
  { id: "core-players",  label: "Core Players",     icon: <Layers size={16} />,          section: null },
  { id: "star-candidates",label:"Star Candidates",  icon: <Trophy size={16} />,          section: null },
  { id: "multi-team",    label: "Trade Discovery",  icon: <RefreshCw size={16} />,       section: null },
  { id: "dataset-health",label:"Dataset Health",    icon: <Activity size={16} />,        section: "PIPELINE" },
  { id: "future-modeling",label:"Modeling Lab",     icon: <Cpu size={16} />,             section: null },
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
    <div className="flex min-h-screen bg-[#070b14] text-slate-100 antialiased">
      {/* ── Sidebar ──────────────────────────────────────────── */}
      <aside className="w-60 fixed h-full z-30 flex flex-col"
        style={{
          background: "linear-gradient(180deg, #08101e 0%, #060c18 100%)",
          borderRight: "1px solid rgba(255,255,255,0.04)",
        }}>

        {/* Logo */}
        <div className="px-5 py-5 flex items-center gap-2.5 border-b border-white/[0.04]">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #0ea5e9, #6366f1)", boxShadow: "0 4px 12px rgba(14,165,233,0.3)" }}>
            <BarChart2 size={16} className="text-white" />
          </div>
          <div>
            <p className="text-xs font-black text-white uppercase tracking-[0.15em] leading-none">NBA Intel</p>
            <p className="text-[9px] text-slate-600 font-semibold mt-0.5 tracking-wider">Analytics Lab</p>
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
                    <p className="text-[9px] font-black text-slate-700 uppercase tracking-[0.2em] px-3 pt-4 pb-1.5">
                      {item.section}
                    </p>
                  )}
                  <button
                    onClick={() => setActiveTab(item.id)}
                    className={activeTab === item.id ? "nav-btn-active" : "nav-btn"}
                  >
                    <span className={activeTab === item.id ? "text-sky-400" : "text-slate-600"}>
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
        <div className="px-4 py-4 border-t border-white/[0.04] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-slate-700 font-bold uppercase tracking-widest">Pipeline</span>
            <span className="text-[9px] font-bold text-emerald-500">V3 Active</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-slate-700 font-bold uppercase tracking-widest">ML Training</span>
            <span className="text-[9px] font-bold text-amber-500">Locked</span>
          </div>
          <div className="h-1 rounded-full bg-slate-900 overflow-hidden mt-1">
            <div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-indigo-500" style={{ width: "65%" }} />
          </div>
          <p className="text-[8px] text-slate-700">Data ready · Model pending</p>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────── */}
      <main className="ml-60 flex-1 min-h-screen relative overflow-hidden">
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(rgba(255,255,255,0.015) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />

        {/* Top bar */}
        <header className="relative z-10 flex items-center justify-between px-8 py-4 border-b border-white/[0.04]"
          style={{ background: "rgba(7,11,20,0.8)", backdropFilter: "blur(12px)" }}>
          <div>
            <p className="text-xs text-slate-600 font-semibold capitalize">
              {MENU.find(m => m.id === activeTab)?.label ?? "Dashboard"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full glass text-[10px] font-bold text-slate-500">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              2025-26 Season
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="relative z-10 p-8">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-sky-500 border-t-transparent" />
              <p className="text-xs text-slate-600 font-bold uppercase tracking-widest">Loading Analytics Lab...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4 text-center max-w-md mx-auto">
              <div className="p-4 bg-rose-500/10 rounded-2xl border border-rose-500/20">
                <RefreshCw size={28} className="text-rose-400 mx-auto" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white mb-1">Failed to Load</h2>
                <p className="text-xs text-slate-500">{error}</p>
              </div>
              <p className="text-[10px] text-slate-600 font-mono bg-slate-950 px-3 py-2 rounded-lg border border-slate-900">
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
