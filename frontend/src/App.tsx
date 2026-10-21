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
const TradeBoard = lazy(() => import("./components/TradeBoard"));
const NbaPrediction = lazy(() => import("./components/NbaPrediction"));
const PlayerPage = lazy(() => import("./components/PlayerPage"));

import { loadPrivateApi } from "./lib/dataCache";

const MENU = [
  { id: "game-results",   label: "Game Results",   icon: <Trophy size={16} strokeWidth={1.5} />,      section: null },
  { id: "player-profile", label: "Player Profile", icon: <UserCircle size={16} strokeWidth={1.5} />,  section: null },
  { id: "team-explorer",  label: "Team Explorer",  icon: <Search size={16} strokeWidth={1.5} />,      section: "Analysis" },
  { id: "multi-team",     label: "Trade Discovery",icon: <RefreshCw size={16} strokeWidth={1.5} />,   section: null },
  { id: "nba-prediction", label: "Predictions",    icon: <BarChart2 size={16} strokeWidth={1.5} />,   section: "Models" },
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
  const [targetTeam, setTargetTeam] = useState<string | null>(() => {
    return sessionStorage.getItem("nba-intel-target-team");
  });

  const [rosters, setRosters]               = useState<any[]>([]);
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
    if (targetTeam) sessionStorage.setItem("nba-intel-target-team", targetTeam);
    else sessionStorage.removeItem("nba-intel-target-team");
  }, [targetTeam]);

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
        setRosters(await loadPrivateApi<any[]>("/frontend-data-api/team-rosters"));
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
      <div className="flex min-h-screen">

        {/* ── Sidebar ── */}
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-background-primary text-text-primary lg:flex">
          {/* Logo / Brand */}
          <div className="border-b border-border px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded bg-primary text-white">
                <BarChart2 size={18} strokeWidth={1.5} />
              </div>
              <div>
                <p className="text-sm font-semibold text-text-primary">NBA Intel</p>
                <p className="text-xs text-text-secondary">Model dashboard</p>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto p-3">
            {MENU.map((item) => (
              <div key={item.id}>
                {item.section && (
                  <p className="px-3 pb-1 pt-4 text-xs font-medium text-text-secondary">
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
        <div className="min-w-0 flex-1">
          {/* Mobile nav: the sidebar is hidden below lg */}
          <nav className="sticky top-0 z-30 flex gap-1 overflow-x-auto border-b border-border bg-background-primary px-3 py-2 lg:hidden" aria-label="Main">
            {MENU.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`${activeTab === item.id ? "nav-btn-active nav-btn" : "nav-btn"} !w-auto shrink-0 whitespace-nowrap`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        <main className="mx-auto w-full max-w-6xl p-4 lg:p-8">

          <div>
            {error ? (
              <div className="mx-auto flex max-w-lg flex-col items-center justify-center gap-4 rounded border border-border bg-background-primary p-6 text-center">
                <div className="text-status-error">
                  <RefreshCw size={24} strokeWidth={1.5} />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-text-primary">Failed to load data</h2>
                  <p className="mt-1 text-sm text-text-secondary">{error}</p>
                </div>
                <p className="rounded border border-border bg-background-tertiary px-3 py-2 font-mono text-xs text-text-secondary">
                  PYTHONPATH=. python3 scripts/build_frontend_store.py
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
                    onSelectTeam={(abbr) => {
                      setTargetTeam(abbr);
                      setActiveTab("team-explorer");
                    }}
                  />
                )}
                <Suspense
                  fallback={
                    <div className="flex h-64 flex-col items-center justify-center gap-3">
                            <p className="text-sm text-text-secondary">Loading module...</p>
                    </div>
                  }
                >
                  {activeTab === "player-profile" && <PlayerPage initialPlayerId={profileTargetPlayerId} />}
                  {activeTab === "team-explorer" && (loading ? (
                    <div className="flex h-72 flex-col items-center justify-center gap-3">
                      <p className="text-sm text-text-secondary">Loading rosters...</p>
                    </div>
                  ) : (
                    <TeamExplorer
                      rosters={rosters}
                      initialTeam={targetTeam ?? undefined}
                      onSelectPlayer={(playerId) => {
                        setProfileTargetPlayerId(playerId);
                        setActiveTab("player-profile");
                      }}
                    />
                  ))}
                  {activeTab === "multi-team" && <TradeBoard />}
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
    </div>
  );
}
