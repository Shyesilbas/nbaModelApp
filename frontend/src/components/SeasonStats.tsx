import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, CalendarDays, ShieldCheck, Swords } from "lucide-react";
import { loadJson } from "../lib/dataCache";

interface GameResult {
  GAME_ID: string;
  GAME_DATE: string;
  HOME_SCORE: number;
  AWAY_SCORE: number;
  SEASON_TYPE: string;
}

function StatCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded border border-border bg-background-primary p-4">
      <p className="text-xs font-medium text-text-secondary">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-text-primary">
        {value.toLocaleString()}
      </p>
      <p className="mt-1 text-xs text-text-secondary">{hint}</p>
    </div>
  );
}

export default function SeasonStats() {
  const [results, setResults] = useState<GameResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadJson<GameResult[]>("/data/game_results.json")
      .then((data) => {
        setResults(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  const stats = useMemo(
    () => ({
      total: results.length,
      regular: results.filter((g) => g.SEASON_TYPE === "Regular Season").length,
      playin: results.filter((g) => g.SEASON_TYPE === "PlayIn").length,
      playoff: results.filter((g) => g.SEASON_TYPE === "Playoffs").length,
      close: results.filter((g) => Math.abs(g.HOME_SCORE - g.AWAY_SCORE) <= 3).length,
      avgMargin:
        results.length > 0
          ? Math.round(results.reduce((sum, g) => sum + Math.abs(g.HOME_SCORE - g.AWAY_SCORE), 0) / results.length)
          : 0,
      totalPoints: results.reduce((sum, g) => sum + g.HOME_SCORE + g.AWAY_SCORE, 0),
      homeWins: results.filter((g) => g.HOME_SCORE > g.AWAY_SCORE).length,
      awayWins: results.filter((g) => g.AWAY_SCORE > g.HOME_SCORE).length,
    }),
    [results],
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center gap-3">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="text-xs text-text-secondary">Loading season stats</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded border border-border bg-background-primary p-6 text-center">
        <AlertTriangle size={24} className="mx-auto mb-2 text-status-error" />
        <p className="text-xs font-medium text-status-error">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">
          Season Overview
        </h1>
        <p className="mt-0.5 text-xs text-text-secondary">
          Season-wide game summary and derived metrics across the dataset.
        </p>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Games" value={stats.total} hint="All games in dataset" />
        <StatCard label="Regular Season" value={stats.regular} hint="Regular season games" />
        <StatCard label="Playoffs" value={stats.playoff} hint="Postseason games" />
        <StatCard label="Close Games" value={stats.close} hint="Decided by 3 pts or fewer" />
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="flex items-center gap-3 rounded border border-border bg-background-primary p-4">
          <CalendarDays className="text-text-secondary" size={18} />
          <div>
            <p className="text-xs font-medium text-text-secondary">Play-In</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-text-primary">
              {stats.playin.toLocaleString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded border border-border bg-background-primary p-4">
          <Swords className="text-text-secondary" size={18} />
          <div>
            <p className="text-xs font-medium text-text-secondary">Average Margin</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-text-primary">
              {stats.avgMargin} pts
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded border border-border bg-background-primary p-4">
          <ShieldCheck className="text-text-secondary" size={18} />
          <div>
            <p className="text-xs font-medium text-text-secondary">Home Wins</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-text-primary">
              {stats.homeWins.toLocaleString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded border border-border bg-background-primary p-4">
          <BarChart3 className="text-text-secondary" size={18} />
          <div>
            <p className="text-xs font-medium text-text-secondary">Total Points</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-text-primary">
              {stats.totalPoints.toLocaleString()}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded border border-border bg-background-primary p-4">
        <h3 className="text-sm font-semibold text-text-primary">Notes</h3>
        <div className="mt-2 grid gap-2 text-xs text-text-secondary md:grid-cols-2">
          <div className="rounded border border-border-light bg-background-tertiary p-3">
            Stats are derived directly from <code className="font-mono">game_results.json</code> so they stay in sync with the results view.
          </div>
          <div className="rounded border border-border-light bg-background-tertiary p-3">
            The full box scores and play-by-play flow remain available inside the Game Results view.
          </div>
        </div>
      </section>
    </div>
  );
}
