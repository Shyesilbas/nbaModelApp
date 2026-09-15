import { Award, Calendar, Cpu, Download, RefreshCw, Sparkles, TrendingUp, Trophy, Zap } from "lucide-react";
import TeamLogo from "../TeamLogo";
import type { TeamInfo } from "./types";
import { exportPredictionAsPDF } from "../../lib/predictionReport";


interface MatchupHeroCardProps {
  result: any;
  homeInfo: TeamInfo;
  awayInfo: TeamInfo;
  winnerInfo: TeamInfo;
  date: string;
  onRefresh?: () => void;
  isLoading?: boolean;
}

export function MatchupHeroCard({
  result,
  homeInfo,
  awayInfo,
  winnerInfo,
  date,
  onRefresh,
  isLoading = false,
}: MatchupHeroCardProps) {
  const win = result?.win_probability || {};
  const score = result?.score_prediction || {};
  
  const homeProb = win.home_win_probability ?? 0.5;
  const awayProb = win.away_win_probability ?? 0.5;
  const homeProbPct = (homeProb * 100).toFixed(1);
  const awayProbPct = (awayProb * 100).toFixed(1);

  const homeScore = score.predicted_home_score?.toFixed(0) ?? "--";
  const awayScore = score.predicted_away_score?.toFixed(0) ?? "--";
  const homeRange = score.home_score_range || [0, 0];
  const awayRange = score.away_score_range || [0, 0];

  const margin = score.predicted_margin ? Math.abs(score.predicted_margin).toFixed(1) : "0.0";
  const total = score.predicted_total_points ? score.predicted_total_points.toFixed(1) : "--";
  const totalRange = score.total_points_range || [0, 0];
  const pace = score.predicted_pace ? score.predicted_pace.toFixed(1) : "99.5";

  const confidence = win.confidence_bucket || "MEDIUM";
  const isHighConfidence = confidence.toUpperCase().includes("STRONG");
  const isModerateConfidence = confidence.toUpperCase().includes("MODERATE");

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    try {
      return new Date(dateStr).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const isHomeWinner = winnerInfo.abbr === homeInfo.abbr;

  return (
    <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 border border-slate-800/80 shadow-[0_25px_60px_rgba(0,0,0,0.45)] p-6 lg:p-8 animate-fade-in-up">
      {/* Dynamic Ambient Background Glows */}
      <div
        className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 rounded-full blur-3xl opacity-20 transition-all duration-700"
        style={{ backgroundColor: awayInfo.color }}
      />
      <div
        className="pointer-events-none absolute -bottom-24 -right-24 w-96 h-96 rounded-full blur-3xl opacity-25 transition-all duration-700"
        style={{ backgroundColor: homeInfo.color }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white/[0.04] via-transparent to-transparent" />

      {/* ── TOP METADATA & ACTIONS BAR ── */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-white/[0.08]">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.06] border border-white/[0.1] text-white/80 text-[10px] font-black uppercase tracking-widest backdrop-blur-md">
            <Cpu size={12} className="text-indigo-400 animate-pulse" />
            <span>V10 ML PREDICTION ENGINE</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-white/50 text-[10px] font-mono font-bold">
            <Calendar size={11} />
            <span>{formatDate(date)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-white/80 hover:text-white text-[11px] font-bold uppercase tracking-wider transition-all border border-white/[0.08] cursor-pointer"
            >
              <RefreshCw size={12} className={isLoading ? "animate-spin text-indigo-400" : ""} />
              <span>Yenile</span>
            </button>
          )}
          <button
            onClick={() => exportPredictionAsPDF({ result, date, fallbackHome: homeInfo.abbr, fallbackAway: awayInfo.abbr })}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-[11px] font-black uppercase tracking-wider transition-all shadow-lg shadow-indigo-500/20 border border-indigo-400/30 cursor-pointer"
          >
            <Download size={12} />
            <span>Raporu İndir (PDF)</span>
          </button>
        </div>
      </div>

      {/* ── MAIN MATCHUP STADIUM BOARD ── */}
      <div className="relative z-10 py-6 grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-6 lg:gap-10">
        
        {/* ── AWAY TEAM CARD ── */}
        <div className="flex flex-col items-center md:items-start text-center md:text-left space-y-3 group">
          <div className="flex items-center gap-4">
            <div
              className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl flex items-center justify-center p-3 transition-transform duration-300 group-hover:scale-105"
              style={{
                background: `linear-gradient(135deg, ${awayInfo.color}33 0%, rgba(15,23,42,0.8) 100%)`,
                border: `1px solid ${awayInfo.color}55`,
                boxShadow: `0 10px 30px ${awayInfo.color}25`,
              }}
            >
              <TeamLogo abbr={awayInfo.abbr} name={awayInfo.name} size={64} />
              {!isHomeWinner && (
                <span className="absolute -top-2 -right-2 p-1.5 bg-amber-400 text-slate-950 rounded-full shadow-lg">
                  <Trophy size={14} />
                </span>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 justify-center md:justify-start">
                <span className="text-[10px] font-black uppercase tracking-widest text-white/40">DEPLASMAN</span>
                {!isHomeWinner && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-400 text-[9px] font-black uppercase tracking-wider">
                    FAVORİ
                  </span>
                )}
              </div>
              <h2
                className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight mt-0.5"
                style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
              >
                {awayInfo.name}
              </h2>
              <p className="text-xs font-bold text-white/50 font-mono">
                {awayInfo.abbr}
              </p>
            </div>
          </div>

          <div className="flex items-baseline gap-3 pt-1">
            <div>
              <span className="text-[9px] font-black uppercase tracking-widest text-white/40 block">Kazanma Olasılığı</span>
              <span className="text-3xl sm:text-4xl font-black font-mono tracking-tight" style={{ color: awayInfo.color }}>
                %{awayProbPct}
              </span>
            </div>
            <div className="pl-4 border-l border-white/10">
              <span className="text-[9px] font-black uppercase tracking-widest text-white/40 block">Tahmini Skor</span>
              <span className="text-2xl sm:text-3xl font-black text-white font-mono">
                {awayScore}
              </span>
              <span className="text-[10px] text-white/40 font-mono block">
                {awayRange[0]}–{awayRange[1]} pts
              </span>
            </div>
          </div>
        </div>

        {/* ── CENTER MATCHUP HUB & BATTLE GAUGE ── */}
        <div className="flex flex-col items-center justify-center space-y-4 px-2 py-4 md:py-0 w-full max-w-sm mx-auto">
          
          {/* Matchup Conviction Pill */}
          <div
            className="flex items-center gap-2 px-4 py-1.5 rounded-full border text-[11px] font-black uppercase tracking-widest backdrop-blur-md shadow-md"
            style={{
              backgroundColor: isHighConfidence
                ? "rgba(16, 185, 129, 0.15)"
                : isModerateConfidence
                ? "rgba(59, 130, 246, 0.15)"
                : "rgba(245, 158, 11, 0.15)",
              borderColor: isHighConfidence
                ? "rgba(16, 185, 129, 0.35)"
                : isModerateConfidence
                ? "rgba(59, 130, 246, 0.35)"
                : "rgba(245, 158, 11, 0.35)",
              color: isHighConfidence ? "#34d399" : isModerateConfidence ? "#60a5fa" : "#fbbf24",
            }}
          >
            <Sparkles size={13} />
            <span>
              {isHighConfidence ? "YÜKSEK GÜVENİLİRLİK" : isModerateConfidence ? "ORTA GÜVENİLİRLİK" : "DENGELİ MAÇ"}
              {" · "}
              {winnerInfo.abbr} +{margin} PTS
            </span>
          </div>

          {/* Probability Tug-of-War Split Bar */}
          <div className="w-full space-y-1.5">
            <div className="flex justify-between text-xs font-black font-mono">
              <span style={{ color: awayInfo.color }}>{awayInfo.abbr} %{awayProbPct}</span>
              <span className="text-white/30 text-[10px] uppercase font-bold tracking-widest">VS</span>
              <span style={{ color: homeInfo.color }}>%{homeProbPct} {homeInfo.abbr}</span>
            </div>
            
            <div className="relative h-4 w-full bg-slate-900 rounded-full overflow-hidden p-0.5 border border-white/10 shadow-inner">
              <div className="flex h-full w-full rounded-full overflow-hidden">
                <div
                  className="h-full transition-all duration-1000 ease-out"
                  style={{
                    width: `${awayProb * 100}%`,
                    backgroundColor: awayInfo.color,
                    boxShadow: `0 0 12px ${awayInfo.color}88`,
                  }}
                />
                <div
                  className="h-full transition-all duration-1000 ease-out"
                  style={{
                    width: `${homeProb * 100}%`,
                    backgroundColor: homeInfo.color,
                    boxShadow: `0 0 12px ${homeInfo.color}88`,
                  }}
                />
              </div>
              {/* Center 50% line */}
              <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-white/40 -translate-x-1/2" />
            </div>
          </div>

          {/* Winner highlight badge */}
          <div className="flex items-center gap-2 px-3.5 py-1 rounded-xl bg-white/[0.04] border border-white/[0.08] text-center">
            <Award size={13} className="text-amber-400" />
            <span className="text-[11px] font-bold text-white/80">
              Model Öngörüsü: <strong className="text-white font-black">{winnerInfo.name}</strong> galibiyeti
            </span>
          </div>
        </div>

        {/* ── HOME TEAM CARD ── */}
        <div className="flex flex-col items-center md:items-end text-center md:text-right space-y-3 group">
          <div className="flex items-center md:flex-row-reverse gap-4">
            <div
              className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl flex items-center justify-center p-3 transition-transform duration-300 group-hover:scale-105"
              style={{
                background: `linear-gradient(135deg, ${homeInfo.color}33 0%, rgba(15,23,42,0.8) 100%)`,
                border: `1px solid ${homeInfo.color}55`,
                boxShadow: `0 10px 30px ${homeInfo.color}25`,
              }}
            >
              <TeamLogo abbr={homeInfo.abbr} name={homeInfo.name} size={64} />
              {isHomeWinner && (
                <span className="absolute -top-2 -right-2 p-1.5 bg-amber-400 text-slate-950 rounded-full shadow-lg">
                  <Trophy size={14} />
                </span>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 justify-center md:justify-end">
                {isHomeWinner && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-400 text-[9px] font-black uppercase tracking-wider">
                    FAVORİ
                  </span>
                )}
                <span className="text-[10px] font-black uppercase tracking-widest text-white/40">EV SAHİBİ</span>
              </div>
              <h2
                className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight mt-0.5"
                style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
              >
                {homeInfo.name}
              </h2>
              <p className="text-xs font-bold text-white/50 font-mono">
                {homeInfo.abbr}
              </p>
            </div>
          </div>

          <div className="flex items-baseline md:flex-row-reverse gap-3 pt-1">
            <div>
              <span className="text-[9px] font-black uppercase tracking-widest text-white/40 block">Kazanma Olasılığı</span>
              <span className="text-3xl sm:text-4xl font-black font-mono tracking-tight" style={{ color: homeInfo.color }}>
                %{homeProbPct}
              </span>
            </div>
            <div className="pr-4 md:border-r border-white/10 text-right">
              <span className="text-[9px] font-black uppercase tracking-widest text-white/40 block">Tahmini Skor</span>
              <span className="text-2xl sm:text-3xl font-black text-white font-mono">
                {homeScore}
              </span>
              <span className="text-[10px] text-white/40 font-mono block">
                {homeRange[0]}–{homeRange[1]} pts
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* ── BOTTOM INTEGRATED KPI METRIC STRIP ── */}
      <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-6 border-t border-white/[0.08]">
        
        {/* Expected Margin */}
        <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-colors">
          <div className="flex items-center gap-1.5 text-indigo-400 mb-1">
            <TrendingUp size={13} />
            <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Beklenen Fark (Spread)</span>
          </div>
          <p className="text-lg font-black text-white font-mono">
            {winnerInfo.abbr} +{margin} pts
          </p>
          <p className="text-[10px] text-white/35 font-medium mt-0.5">
            Öngörülen galibiyet marjı
          </p>
        </div>

        {/* Total Points */}
        <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-colors">
          <div className="flex items-center gap-1.5 text-violet-400 mb-1">
            <Zap size={13} />
            <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Toplam Sayı (Over/Under)</span>
          </div>
          <p className="text-lg font-black text-white font-mono">
            {total} pts
          </p>
          <p className="text-[10px] text-white/35 font-mono mt-0.5">
            Aralık: {totalRange[0]} – {totalRange[1]}
          </p>
        </div>

        {/* Projected Game Pace */}
        <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-colors">
          <div className="flex items-center gap-1.5 text-amber-400 mb-1">
            <Cpu size={13} />
            <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Maç Temposu (Pace)</span>
          </div>
          <p className="text-lg font-black text-white font-mono">
            {pace} <span className="text-xs font-normal text-white/40">pos/48m</span>
          </p>
          <p className="text-[10px] text-white/35 font-medium mt-0.5">
            {parseFloat(pace) > 100 ? "Yüksek Tempolu Hücum" : "Kontrollü Set Oyunu"}
          </p>
        </div>

        {/* Model Signal Engine */}
        <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-colors">
          <div className="flex items-center gap-1.5 text-emerald-400 mb-1">
            <Sparkles size={13} />
            <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Model Karar Motoru</span>
          </div>
          <p className="text-lg font-black text-emerald-400 font-mono">
            {confidence}
          </p>
          <p className="text-[10px] text-white/35 font-medium mt-0.5">
            Kalibre Edilmiş ML + Oyuncu Simülasyonu
          </p>
        </div>

      </div>

    </div>
  );
}
