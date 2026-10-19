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

import { loadJson } from "./lib/dataCache";

const MENU = [
  { id: "game-results",   label: "Game Results",   icon: <Trophy size={15} />,      section: null },
  { id: "player-profile", label: "Player Profile", icon: <UserCircle size={15} />,  section: null },
  { id: "team-explorer",  label: "Team Explorer",  icon: <Search size={15} />,      section: "Analysis" },
  { id: "multi-team",     label: "Trade Discovery",icon: <RefreshCw size={15} />,   section: null },
  { id: "nba-prediction", label: "Predictions",    icon: <BarChart2 size={15} />,   section: "Models" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState(() => {
    const savedTab = sessionStorage.getItem("nba-intel-active-tab");
    return MENU.some((item) => item.id === savedTab) ? savedTab! : "game-results";
  });
  const [predictionTarget, setPredictionTarget] = useState<{ home: string; away: string; date: string } | null>(() => {
    try {
      const saved = sessionStorage.getItem("nba-intel-prediction-target");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [profileTargetPlayerId, setProfileTargetPlayerId] = useState<number | null>(() => {
    const saved = sessionStorage.getItem("nba-intel-profile-player-id");
    return saved ? Number(saved) : null;
  });

  const [rosters, setRosters]               = useState<any[]>([]);
  const [multiTeamPlayers, setMultiTeamPlayers] = useState<any[]>([]);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState<string | null>(null);

  useEffect(() => {
    sessionStorage.setItem("nba-intel-active-tab", activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (predictionTarget) sessionStorage.setItem("nba-intel-prediction-target", JSON.stringify(predictionTarget));
    else sessionStorage.removeItem("nba-intel-prediction-target");
  }, [predictionTarget]);

  useEffect(() => {
    if (profileTargetPlayerId != null) sessionStorage.setItem("nba-intel-profile-player-id", String(profileTargetPlayerId));
    else sessionStorage.removeItem("nba-intel-profile-player-id");
  }, [profileTargetPlayerId]);

  useEffect(() => {
    const saveScroll = () => sessionStorage.setItem("nba-intel-scroll-y", String(window.scrollY));
    window.addEventListener("scroll", saveScroll, { passive: true });
    return () => window.removeEventListener("scroll", saveScroll);
  }, []);

  useEffect(() => {
    if (loading) return;
    const savedScroll = Number(sessionStorage.getItem("nba-intel-scroll-y") ?? 0);
    const frame = requestAnimationFrame(() => window.scrollTo(0, savedScroll));
    return () => cancelAnimationFrame(frame);
  }, [loading]);

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
      } catch (e: any) {
        setError(e.message);
        setLoading(false);
      }
    };
    fetchAll();
  }, []);


  return (
    <div className="min-h-screen bg-background-secondary text-text-primary">
      <div className="mx-auto flex min-h-screen max-w-7xl gap-4 p-4 lg:p-6">

        {/* ── Sidebar ── */}
        <aside className="sticky top-4 hidden h-[calc(100vh-2rem)] w-56 shrink-0 flex-col overflow-hidden rounded border border-border bg-background-primary text-text-primary lg:flex">
          {/* Logo / Brand */}
          <div className="border-b border-border px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded bg-primary text-white">
                <BarChart2 size={16} className="text-white" />
              </div>
              <div>
                <p className="text-xs font-semibold text-text-primary">NBA Intel</p>
                <p className="text-xs text-text-secondary">Model dashboard</p>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto p-2">
            {MENU.map((item) => (
              <div key={item.id}>
                {item.section && (
                  <p className="px-3 pb-1 pt-3 text-xs font-medium text-text-muted">
                    {item.section}
                  </p>
                )}
                <button
                  onClick={() => setActiveTab(item.id)}
                  className={activeTab === item.id ? "nav-btn-active nav-btn" : "nav-btn"}
                >
                  <span className={activeTab === item.id ? "text-white" : "text-text-secondary"}>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              </div>
            ))}
          </nav>

        </aside>

        {/* ── Main ── */}
        <main className="min-w-0 flex-1">

          <div>
            {loading ? (
              <div className="flex h-72 flex-col items-center justify-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <p className="text-xs font-medium text-text-secondary">Loading stats and models...</p>
              </div>
            ) : error ? (
              <div className="mx-auto flex max-w-lg flex-col items-center justify-center gap-4 rounded border border-border bg-background-primary p-6 text-center">
                <div className="text-status-error">
                  <RefreshCw size={24} className="animate-spin" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-text-primary">Failed to load data</h2>
                  <p className="mt-1 text-sm text-text-secondary">{error}</p>
                </div>
                <p className="rounded border border-border bg-background-tertiary px-3 py-2 font-mono text-xs text-text-secondary">
                  python3 scripts/export_frontend_data.py
                </p>
              </div>
            ) : (
              <div className="space-y-4">
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
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      <p className="text-xs font-medium text-text-secondary">Loading module...</p>
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
