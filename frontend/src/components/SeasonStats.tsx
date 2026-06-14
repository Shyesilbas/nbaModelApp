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
    <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
      <p className="text-[9px] font-black uppercase tracking-[0.28em] text-slate-400">{label}</p>
      <p className="mt-2 text-4xl font-black text-slate-900" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
        {value.toLocaleString()}
      </p>
      <p className="mt-2 text-xs font-medium text-slate-500">{hint}</p>
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
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#1d428a] border-t-transparent" />
        <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Loading season stats...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <AlertTriangle size={32} className="mx-auto mb-3 text-rose-500" />
        <p className="text-sm font-bold text-rose-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_16px_50px_rgba(15,23,42,0.05)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">
              <BarChart3 size={12} className="text-[#1d428a]" />
              Season Stats
            </div>
            <h1 className="text-4xl font-black uppercase tracking-tight text-slate-900 sm:text-5xl" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              Season-wide game summary
            </h1>
            <p className="max-w-3xl text-sm leading-relaxed text-slate-500">
              All game-level counts and derived season metrics that were previously shown inside Game Results.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[520px]">
            <StatCard label="Total Games" value={stats.total} hint="All games in the local results dataset" />
            <StatCard label="Regular Season" value={stats.regular} hint="Games marked as regular season" />
            <StatCard label="Playoffs" value={stats.playoff} hint="Games marked as playoffs" />
            <StatCard label="Close Games" value={stats.close} hint="Games decided by 3 points or fewer" />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <CalendarDays className="text-[#1d428a]" size={18} />
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.28em] text-slate-400">Play-In</p>
              <p className="mt-1 text-2xl font-black text-slate-900" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                {stats.playin.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Swords className="text-[#c9082a]" size={18} />
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.28em] text-slate-400">Average Margin</p>
              <p className="mt-1 text-2xl font-black text-slate-900" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                {stats.avgMargin}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <ShieldCheck className="text-emerald-600" size={18} />
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.28em] text-slate-400">Home Wins</p>
              <p className="mt-1 text-2xl font-black text-slate-900" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                {stats.homeWins.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <BarChart3 className="text-violet-600" size={18} />
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.28em] text-slate-400">Total Points</p>
              <p className="mt-1 text-2xl font-black text-slate-900" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                {stats.totalPoints.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-[9px] font-black uppercase tracking-[0.28em] text-slate-400">Notes</p>
        <div className="mt-3 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
          <div className="rounded-2xl bg-slate-50 p-4">Stats are derived directly from `game_results.json` so they stay in sync with the results view.</div>
          <div className="rounded-2xl bg-slate-50 p-4">The list and game detail experience remains in Game Results; only season-level aggregates live here now.</div>
        </div>
      </section>
    </div>
  );
}
