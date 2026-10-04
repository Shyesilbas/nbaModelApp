import { useState, useEffect, lazy, Suspense } from "react";
import {
  Search,
  Trophy,
  RefreshCw,
  BarChart2,
  UserCircle,
} from "lucide-react";
import GameResults from "./components/GameResults";

const TeamExplorer = lazy(() => import("./components/TeamExplorer"));
const MultiTeamPlayers = lazy(() => import("./components/MultiTeamPlayers"));
const NbaPrediction = lazy(() => import("./components/NbaPrediction"));
const PlayerPage = lazy(() => import("./components/PlayerPage"));

import { loadJson, prefetchManifestFiles } from "./lib/dataCache";

const MENU = [
  { id: "game-results",   label: "Game Results",   icon: <Trophy size={15} />,      section: null },
  { id: "player-profile", label: "Player Profile", icon: <UserCircle size={15} />,  section: null },
  { id: "team-explorer",  label: "Team Explorer",  icon: <Search size={15} />,      section: "Analysis" },
  { id: "multi-team",     label: "Trade Discovery",icon: <RefreshCw size={15} />,   section: null },
  { id: "nba-prediction", label: "Predictions",    icon: <BarChart2 size={15} />,   section: "Models" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("game-results");
  const [predictionTarget, setPredictionTarget] = useState<{ home: string; away: string; date: string } | null>(null);
  const [profileTargetPlayerId, setProfileTargetPlayerId] = useState<number | null>(null);

  const [rosters, setRosters]               = useState<any[]>([]);
  const [multiTeamPlayers, setMultiTeamPlayers] = useState<any[]>([]);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState<string | null>(null);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        await loadJson("/data/dataset_summary.json");
        const [rostersData, multiData] = await Promise.all([
          loadJson<any[]>("/data/team_rosters.json"),
          loadJson<any[]>("/data/multi_team_players.json"),
        ]);
        setRosters(rostersData);
        setMultiTeamPlayers(multiData);
        setLoading(false);
        // Start background prefetching of all files in the manifest
        prefetchManifestFiles().catch((err) => console.error("Prefetch error:", err));
      } catch (e: any) {
        setError(e.message);
        setLoading(false);
      }
    };
    fetchAll();
  }, []);


  return (
    <div className="min-h-screen text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1800px] gap-5 p-4 lg:p-5">

        {/* ── Sidebar ── */}
        <aside className="sticky top-4 hidden h-[calc(100vh-2rem)] w-56 shrink-0 flex-col overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white text-slate-900 shadow-[0_16px_50px_rgba(15,23,42,0.07)] lg:flex">
          {/* Logo / Brand */}
          <div className="border-b border-slate-100 px-4 py-3.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white">
                <BarChart2 size={16} className="text-white" />
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.28em] text-slate-400">NBA Intel</p>
                <p className="text-[13px] font-bold text-slate-800">Model dashboard</p>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto px-2.5 py-2">
            {MENU.map((item) => (
              <div key={item.id}>
                {item.section && (
                  <p className="px-2 pb-1 pt-3 text-[9px] font-black uppercase tracking-[0.28em] text-slate-400">
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

          {/* Season status — compact footer strip */}
          <div className="border-t border-slate-100 px-3.5 py-3">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <p className="text-[10px] font-semibold text-slate-500">Season data synced</p>
            </div>
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="min-w-0 flex-1">

          <div>
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
              <div className="space-y-5">
                {activeTab === "game-results" && (
                  <GameResults
                    onNavigateToPrediction={(game) => {
                      setPredictionTarget({
                        home: game.HOME_TEAM_ABBREVIATION,
                        away: game.AWAY_TEAM_ABBREVIATION,
                        date: game.GAME_DATE,
                      });
                      setActiveTab("nba-prediction");
                    }}
                  />
                )}
                <Suspense
                  fallback={
                    <div className="flex h-64 flex-col items-center justify-center gap-3">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-900 border-t-transparent" />
                      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Loading module...</p>
                    </div>
                  }
                >
                  {activeTab === "player-profile" && <PlayerPage initialPlayerId={profileTargetPlayerId} />}
                  {activeTab === "team-explorer" && (
                    <TeamExplorer
                      rosters={rosters}
                      onSelectPlayer={(playerId) => {
                        setProfileTargetPlayerId(playerId);
                        setActiveTab("player-profile");
                      }}
                    />
                  )}
                  {activeTab === "multi-team" && <MultiTeamPlayers players={multiTeamPlayers} />}
                  {activeTab === "nba-prediction" && (
                    <NbaPrediction
                      initialGame={predictionTarget}
                      onClearInitialGame={() => setPredictionTarget(null)}
                    />
                  )}
                </Suspense>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
