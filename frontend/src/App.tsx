import { useState, useEffect, lazy, Suspense, useCallback } from "react";
import {
  Search,
  CalendarDays,
  RefreshCw,
  BarChart2,
  UserCircle,
  ArrowLeftRight,
  ClipboardCheck,
  Stethoscope,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import GameResults from "./components/GameResults";
import { parseUrlRoute, updateUrlRoute } from "./lib/router";
import { ThemeToggle } from "./components/common/ThemeToggle";
import { CommandPalette } from "./components/common/CommandPalette";

const TeamExplorer = lazy(() => import("./components/TeamExplorer"));
const TradeBoard = lazy(() => import("./components/TradeBoard"));
const NbaPrediction = lazy(() => import("./components/NbaPrediction"));
const PlayerPage = lazy(() => import("./components/PlayerPage"));
const PaperTrading = lazy(() => import("./components/PaperTrading"));
const InjuriesTab = lazy(() => import("./components/InjuriesTab"));
const PlayerCompare = lazy(() =>
  import("./components/PlayerCompare").then((m) => ({ default: m.PlayerCompare }))
);

import { loadPrivateApi } from "./lib/dataCache";

const MENU = [
  { id: "game-results",   label: "Game Results",   icon: <CalendarDays size={16} strokeWidth={1.5} />, section: "Fixture" },
  { id: "player-profile", label: "Player Profile", icon: <UserCircle size={16} strokeWidth={1.5} />,  section: "Players" },
  { id: "player-compare", label: "Head-to-Head",   icon: <ArrowLeftRight size={16} strokeWidth={1.5} />, section: null },
  { id: "team-explorer",  label: "Team Explorer",  icon: <Search size={16} strokeWidth={1.5} />,      section: "Analysis" },
  { id: "multi-team",     label: "Trade Discovery",icon: <RefreshCw size={16} strokeWidth={1.5} />,   section: null },
  { id: "nba-prediction", label: "Predictions",    icon: <BarChart2 size={16} strokeWidth={1.5} />,   section: "Models" },
  { id: "paper-trading",  label: "Paper Trading",  icon: <ClipboardCheck size={16} strokeWidth={1.5} />, section: null },
  { id: "injuries",       label: "Injuries",       icon: <Stethoscope size={16} strokeWidth={1.5} />,    section: null },
];

export default function App() {
  const [activeTab, setActiveTab] = useState(() => {
    const urlRoute = parseUrlRoute();
    if (MENU.some((item) => item.id === urlRoute.tab)) return urlRoute.tab;
    const savedTab = sessionStorage.getItem("nba-intel-active-tab");
    return MENU.some((item) => item.id === savedTab) ? savedTab! : "game-results";
  });

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem("nba-intel-sidebar-collapsed") === "true";
  });

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("nba-intel-sidebar-collapsed", String(next));
      return next;
    });
  };

  const [predictionTarget, setPredictionTarget] = useState<{ home: string; away: string; date: string } | null>(() => {
    const urlRoute = parseUrlRoute();
    if (urlRoute.predictHome && urlRoute.predictAway && urlRoute.predictDate) {
      return { home: urlRoute.predictHome, away: urlRoute.predictAway, date: urlRoute.predictDate };
    }
    try {
      const saved = sessionStorage.getItem("nba-intel-prediction-target");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [profileTargetPlayerId, setProfileTargetPlayerId] = useState<number | null>(() => {
    const urlRoute = parseUrlRoute();
    if (urlRoute.playerId != null) return urlRoute.playerId;
    const saved = sessionStorage.getItem("nba-intel-profile-player-id");
    return saved ? Number(saved) : null;
  });

  const [targetTeam, setTargetTeam] = useState<string | null>(() => {
    const urlRoute = parseUrlRoute();
    if (urlRoute.team) return urlRoute.team;
    return sessionStorage.getItem("nba-intel-target-team");
  });

  const [compareP1, setCompareP1] = useState<number | null>(() => {
    const urlRoute = parseUrlRoute();
    return urlRoute.compareP1 ?? null;
  });

  const [compareP2, setCompareP2] = useState<number | null>(() => {
    const urlRoute = parseUrlRoute();
    return urlRoute.compareP2 ?? null;
  });

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // Global keyboard shortcut for Command Palette (Cmd + K or Ctrl + K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const [rosters, setRosters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sync state changes from popstate (browser back/forward buttons)
  useEffect(() => {
    const handlePopState = () => {
      const route = parseUrlRoute();
      if (MENU.some((item) => item.id === route.tab)) {
        setActiveTab(route.tab);
      }
      setProfileTargetPlayerId(route.playerId ?? null);
      setTargetTeam(route.team ?? null);
      setCompareP1(route.compareP1 ?? null);
      setCompareP2(route.compareP2 ?? null);
      if (route.predictHome && route.predictAway && route.predictDate) {
        setPredictionTarget({
          home: route.predictHome,
          away: route.predictAway,
          date: route.predictDate,
        });
      } else {
        setPredictionTarget(null);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const handleTabChange = useCallback((tabId: string) => {
    setActiveTab(tabId);
    sessionStorage.setItem("nba-intel-active-tab", tabId);
    updateUrlRoute({ tab: tabId });
  }, []);

  useEffect(() => {
    sessionStorage.setItem("nba-intel-active-tab", activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (predictionTarget) {
      sessionStorage.setItem("nba-intel-prediction-target", JSON.stringify(predictionTarget));
    } else {
      sessionStorage.removeItem("nba-intel-prediction-target");
    }
  }, [predictionTarget]);

  useEffect(() => {
    if (profileTargetPlayerId != null) {
      sessionStorage.setItem("nba-intel-profile-player-id", String(profileTargetPlayerId));
    } else {
      sessionStorage.removeItem("nba-intel-profile-player-id");
    }
  }, [profileTargetPlayerId]);

  useEffect(() => {
    if (targetTeam) {
      sessionStorage.setItem("nba-intel-target-team", targetTeam);
    } else {
      sessionStorage.removeItem("nba-intel-target-team");
    }
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
        <aside
          className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-background-primary text-text-primary transition-all duration-200 lg:flex ${
            sidebarCollapsed ? "w-16" : "w-60"
          }`}
        >
          {/* Collapse Toggle Header (Replaces former NBA Intel / Model dashboard text) */}
          <div className="flex h-14 items-center border-b border-border px-3">
            <button
              type="button"
              onClick={toggleSidebar}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={`flex h-8 w-8 items-center justify-center rounded text-text-secondary hover:bg-background-tertiary hover:text-text-primary transition-colors ${
                sidebarCollapsed ? "mx-auto" : "ml-auto"
              }`}
            >
              {sidebarCollapsed ? (
                <PanelLeft size={18} strokeWidth={1.5} />
              ) : (
                <PanelLeftClose size={18} strokeWidth={1.5} />
              )}
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto p-2">
            {MENU.map((item) => (
              <div key={item.id} className="mb-1">
                {item.section && !sidebarCollapsed && (
                  <p className="px-3 pb-1 pt-3 text-xs font-medium text-text-secondary">
                    {item.section}
                  </p>
                )}
                <button
                  onClick={() => handleTabChange(item.id)}
                  title={sidebarCollapsed ? item.label : undefined}
                  className={`flex w-full items-center gap-3 rounded px-3 py-2 text-xs font-medium transition-colors ${
                    activeTab === item.id
                      ? "bg-primary text-white"
                      : "text-text-secondary hover:bg-background-tertiary hover:text-text-primary"
                  } ${sidebarCollapsed ? "justify-center px-0" : ""}`}
                >
                  <span className={activeTab === item.id ? "text-white" : "text-text-secondary"}>
                    {item.icon}
                  </span>
                  {!sidebarCollapsed && <span>{item.label}</span>}
                </button>
              </div>
            ))}
          </nav>
        </aside>

        {/* ── Main ── */}
        <div className="min-w-0 flex-1">
          {/* Top Bar for Desktop and Mobile */}
          <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background-primary px-4 py-2.5 lg:px-8">
            <div className="flex items-center gap-2 lg:hidden">
              <div className="flex h-7 w-7 items-center justify-center rounded bg-primary text-white">
                <BarChart2 size={15} strokeWidth={1.5} />
              </div>
              <span className="text-sm font-semibold text-text-primary">NBA Intel</span>
            </div>
            
            {/* Global Search Bar (Trigger for Cmd+K) */}
            <div className="flex-1 max-w-md mx-2 sm:mx-0">
              <button
                type="button"
                onClick={() => setCommandPaletteOpen(true)}
                className="flex w-full items-center justify-between rounded border border-border bg-background-secondary px-3 py-1.5 text-xs text-text-muted hover:border-border-hover hover:text-text-primary transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Search size={14} strokeWidth={1.5} />
                  <span>Quick search players, teams...</span>
                </div>
                <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border bg-background-tertiary px-1.5 py-0.5 font-mono text-[10px] uppercase text-text-secondary">
                  ⌘K
                </kbd>
              </button>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <ThemeToggle />
            </div>
          </header>

          {/* Mobile nav */}
          <nav
            className="flex gap-1 overflow-x-auto border-b border-border bg-background-primary px-3 py-2 lg:hidden"
            aria-label="Main"
          >
            {MENU.map((item) => (
              <button
                key={item.id}
                onClick={() => handleTabChange(item.id)}
                className={`${
                  activeTab === item.id ? "nav-btn-active nav-btn" : "nav-btn"
                } !w-auto shrink-0 whitespace-nowrap`}
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
                    <h2 className="text-base font-semibold text-text-primary">
                      Failed to load data
                    </h2>
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
                        const target = {
                          home: game.HOME_TEAM_ABBREVIATION,
                          away: game.AWAY_TEAM_ABBREVIATION,
                          date: game.GAME_DATE,
                        };
                        setPredictionTarget(target);
                        setActiveTab("nba-prediction");
                        updateUrlRoute({
                          tab: "nba-prediction",
                          predictHome: target.home,
                          predictAway: target.away,
                          predictDate: target.date,
                        });
                      }}
                      onSelectTeam={(abbr) => {
                        setTargetTeam(abbr);
                        setActiveTab("team-explorer");
                        updateUrlRoute({ tab: "team-explorer", team: abbr });
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
                    {activeTab === "player-profile" && (
                      <PlayerPage
                        initialPlayerId={profileTargetPlayerId}
                        onSelectGame={(gameId) => {
                          setActiveTab("game-results");
                          updateUrlRoute({ tab: "game-results", gameId });
                        }}
                      />
                    )}
                    {activeTab === "paper-trading" && <PaperTrading />}
                    {activeTab === "injuries" && <InjuriesTab />}
                    {activeTab === "player-compare" && (
                      <PlayerCompare
                        initialP1Id={compareP1}
                        initialP2Id={compareP2}
                        onSelectPlayerProfile={(playerId) => {
                          setProfileTargetPlayerId(playerId);
                          setActiveTab("player-profile");
                          updateUrlRoute({ tab: "player-profile", playerId });
                        }}
                      />
                    )}
                    {activeTab === "team-explorer" &&
                      (loading ? (
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
                            updateUrlRoute({ tab: "player-profile", playerId });
                          }}
                        />
                      ))}
                    {activeTab === "multi-team" && <TradeBoard />}
                    {activeTab === "nba-prediction" && (
                      <NbaPrediction
                        initialGame={predictionTarget}
                        onClearInitialGame={() => {
                          setPredictionTarget(null);
                          updateUrlRoute({
                            predictHome: null,
                            predictAway: null,
                            predictDate: null,
                          });
                        }}
                      />
                    )}
                  </Suspense>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>

      {/* Global Command Palette (Cmd + K) */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onSelectPlayer={(playerId) => {
          setProfileTargetPlayerId(playerId);
          setActiveTab("player-profile");
          updateUrlRoute({ tab: "player-profile", playerId });
        }}
        onSelectTeam={(abbr) => {
          setTargetTeam(abbr);
          setActiveTab("team-explorer");
          updateUrlRoute({ tab: "team-explorer", team: abbr });
        }}
      />
    </div>
  );
}
