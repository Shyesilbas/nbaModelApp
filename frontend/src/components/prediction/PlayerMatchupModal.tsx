import { useEffect, useState, useMemo } from "react";
import { X, TrendingUp, TrendingDown, Minus, Shield, Trophy, Users, Clock, Flame, BarChart2, Info } from "lucide-react";
import PlayerPhoto from "../PlayerPhoto";
import { loadJson, loadPrivateApi } from "../../lib/dataCache";
import type { TeamInfo } from "./types";


export interface PlayerMatchupData {
  player_id: number | string;
  player_name: string;
  position_group: string;
  predicted_pts: number;
  predicted_reb: number;
  predicted_ast: number;
  predicted_pra: number;
  raw_pts?: number;
  scale_factor?: number;
  status?: "ACTIVE" | "RESTRICTED" | "OUT";
}

interface PlayerMatchupModalProps {
  player: PlayerMatchupData | null;
  teamInfo: TeamInfo;
  opponentInfo: TeamInfo;
  gameDate?: string;
  season?: string;
  onClose: () => void;
}

interface GameRow {
  GAME_ID: string;
  GAME_DATE: string;
  MATCHUP?: string;
  WL?: string;
  MIN?: number;
  PTS?: number;
  REB?: number;
  AST?: number;
  PRA?: number;
  FGM?: number;
  FGA?: number;
  FG_PCT?: number;
  FG3M?: number;
  PLUS_MINUS?: number;
  DID_NOT_PLAY?: boolean;
}

interface SeasonAverages {
  PTS?: number;
  REB?: number;
  AST?: number;
  MIN?: number;
  FG_PCT?: number;
  GAMES_PLAYED?: number;
}

export function PlayerMatchupModal({
  player,
  teamInfo,
  opponentInfo,
  gameDate,
  season = "2025-26",
  onClose,
}: PlayerMatchupModalProps) {
  const [games, setGames] = useState<GameRow[]>([]);
  const [seasonAverages, setSeasonAverages] = useState<SeasonAverages | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Fetch player game logs and season averages
  useEffect(() => {
    if (!player) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    const playerId = String(player.player_id);

    const fetchPlayerData = async () => {
      try {
        // 1. Try private API first
        try {
          const payload = await loadPrivateApi<{
            player_id: string;
            games: Record<string, GameRow[]>;
            averages: Record<string, SeasonAverages>;
          }>(`/frontend-data-api/players/${encodeURIComponent(playerId)}`);

          if (!isMounted) return;

          const gamesBySeason = payload.games || {};
          const availableSeasons = Object.keys(gamesBySeason).sort();
          const latestSeason = availableSeasons.length > 0 ? availableSeasons[availableSeasons.length - 1] : "";
          const targetSeason = gamesBySeason[season]?.length ? season : latestSeason;

          const allPlayedGames = Object.values(gamesBySeason).flat().filter((g) => !g.DID_NOT_PLAY);
          allPlayedGames.sort((a, b) => b.GAME_DATE.localeCompare(a.GAME_DATE));

          const seasonAvg = payload.averages?.[targetSeason] || payload.averages?.[latestSeason] || null;

          setGames(allPlayedGames);
          setSeasonAverages(seasonAvg);
          setLoading(false);
          return;
        } catch {
          // Fallback to static JSON
        }

        // 2. Static JSON fallback
        const [playerGamesMap, playerAveragesMap] = await Promise.all([
          loadJson<Record<string, GameRow[]>>(`/data/player_games/${encodeURIComponent(playerId)}.json`, {}),
          loadJson<Record<string, Record<string, SeasonAverages>>>("/data/player_season_averages.json", {}),
        ]);

        if (!isMounted) return;

        const availableSeasons = Object.keys(playerGamesMap).sort();
        const latestSeason = availableSeasons.length > 0 ? availableSeasons[availableSeasons.length - 1] : "";
        const targetSeason = playerGamesMap[season]?.length ? season : latestSeason;

        const allPlayedGames = Object.values(playerGamesMap).flat().filter((g) => !g.DID_NOT_PLAY);
        allPlayedGames.sort((a, b) => b.GAME_DATE.localeCompare(a.GAME_DATE));

        const seasonAvg = playerAveragesMap[playerId]?.[targetSeason] || playerAveragesMap[playerId]?.[latestSeason] || null;

        setGames(allPlayedGames);
        setSeasonAverages(seasonAvg);
      } catch (err: any) {
        if (!isMounted) return;
        console.error("Failed to load player history:", err);
        setError("Oyuncu geçmiş maç verileri yüklenemedi.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchPlayerData();

    return () => {
      isMounted = false;
    };
  }, [player, season]);

  // Calculate recent stats (Last 5 games before gameDate if given)
  const { recentGames, stats5 } = useMemo(() => {
    if (!games || games.length === 0) {
      return { recentGames: [], stats5: null };
    }

    // Filter games prior to prediction date if available
    let eligibleGames = [...games];
    if (gameDate) {
      eligibleGames = eligibleGames.filter((g) => g.GAME_DATE <= gameDate);
    }
    // Sort descending by date
    eligibleGames.sort((a, b) => b.GAME_DATE.localeCompare(a.GAME_DATE));

    const g5 = eligibleGames.slice(0, 5);

    const calcAvg = (rows: GameRow[]) => {
      if (rows.length === 0) return null;
      const n = rows.length;
      const pts = rows.reduce((s, r) => s + (r.PTS ?? 0), 0) / n;
      const reb = rows.reduce((s, r) => s + (r.REB ?? 0), 0) / n;
      const ast = rows.reduce((s, r) => s + (r.AST ?? 0), 0) / n;
      const min = rows.reduce((s, r) => s + (r.MIN ?? 0), 0) / n;
      const fgPct = rows.reduce((s, r) => s + (r.FG_PCT ?? 0), 0) / n;
      const pra = pts + reb + ast;
      return { pts, reb, ast, min, fgPct, pra, count: n };
    };

    return {
      recentGames: eligibleGames.slice(0, 10),
      stats5: calcAvg(g5),
    };
  }, [games, gameDate]);

  // Build automated data-driven insights narrative
  const narrative = useMemo(() => {
    if (!player) return [];
    const parts: string[] = [];

    const ptsProj = player.predicted_pts;
    const pts5 = stats5?.pts ?? seasonAverages?.PTS ?? 0;
    const ptsSeason = seasonAverages?.PTS ?? pts5;

    // 1. Scoring trend insight
    if (stats5 && stats5.count >= 3) {
      const diffPct = ptsSeason > 0 ? ((ptsProj - ptsSeason) / ptsSeason) * 100 : 0;
      const formDiff = ((stats5.pts - ptsSeason) / Math.max(ptsSeason, 1)) * 100;

      let trendWord = "istikrarlı bir çizgide";
      if (formDiff > 10) trendWord = "belirgin bir yükseliş trendinde (sıcak form)";
      else if (formDiff < -10) trendWord = "son dönemde hafif bir düşüş grafiğinde";

      parts.push(
        `Son 5 maçında ortalama ${stats5.pts.toFixed(1)} sayı, ${stats5.reb.toFixed(1)} ribaund ve ${stats5.ast.toFixed(1)} asist (` +
        `${stats5.min.toFixed(1)} dk, %${((stats5.fgPct || 0) * 100).toFixed(0)} FG) ile ${trendWord} oynuyor. Sezon ortalaması ise ${ptsSeason.toFixed(1)} PTS.`
      );

      if (Math.abs(diffPct) >= 5) {
        const dir = diffPct > 0 ? "artış" : "azalış";
        parts.push(
          `Model bu maç için ${ptsProj.toFixed(1)} sayı (${diffPct > 0 ? "+" : ""}${diffPct.toFixed(1)}% ${dir}) öngörmektedir. ` +
          `Bu projeksiyon; takımın beklenen maç temposu (${teamInfo.abbr} - ${opponentInfo.abbr}) ve oyuncunun kullanım hacmi (USG) ile doğrudan ilişkilidir.`
        );
      } else {
        parts.push(
          `Modelin ${ptsProj.toFixed(1)} sayı tahmini, oyuncunun temel sezon standartlarıyla dengeli bir uyum göstermektedir.`
        );
      }
    } else {
      parts.push(
        `Sezon genelinde ${ptsSeason.toFixed(1)} sayı, ${seasonAverages?.REB?.toFixed(1) || 0} ribaund ve ${seasonAverages?.AST?.toFixed(1) || 0} asist ortalamasına sahip.`
      );
    }

    // 2. Position group and matchup context
    const pos = player.position_group || "Oyuncu";
    parts.push(
      `${opponentInfo.name} (${opponentInfo.abbr}) savunmasına karşı ${pos} pozisyonunda ana hücum/rotasyon aktörü olarak sahada yer alması bekleniyor.`
    );

    // 3. Top-down scaling context if present
    if (player.scale_factor && player.raw_pts) {
      const scalePercent = ((player.scale_factor - 1) * 100).toFixed(1);
      const isPositive = player.scale_factor >= 1.0;
      parts.push(
        `Skor modeli senkronizasyonu: Ham bireysel model tahmini ${player.raw_pts.toFixed(1)} PTS iken, ` +
        `takımın hedeflenen maç skoru doğrultusunda ${player.scale_factor.toFixed(3)}x katsayısı (${isPositive ? "+" : ""}${scalePercent}%) uygulanarak ${player.predicted_pts.toFixed(1)} PTS olarak kalibre edilmiştir.`
      );
    }

    return parts;
  }, [player, stats5, seasonAverages, teamInfo, opponentInfo]);

  if (!player) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── HEADER ── */}
        <div 
          className="relative px-6 py-5 border-b border-slate-100 flex items-center justify-between text-white"
          style={{
            background: `linear-gradient(135deg, ${teamInfo.color || "#1e293b"} 0%, #0f172a 100%)`
          }}
        >
          <div className="flex items-center gap-4">
            <PlayerPhoto playerId={player.player_id} name={player.player_name} size={56} className="ring-2 ring-white/30 shadow-md" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-white/20 text-white">
                  {player.position_group}
                </span>
                <span className="text-[10px] font-bold text-white/70 uppercase">
                  {teamInfo.abbr} vs {opponentInfo.abbr}
                </span>
              </div>
              <h3 className="text-xl font-black text-white mt-1 leading-tight tracking-tight">
                {player.player_name}
              </h3>
              <p className="text-xs text-white/70 font-semibold mt-0.5">
                Veriye Dayalı Maç Raporu & Projeksiyon Detayı
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
            title="Kapat (ESC)"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── BODY (Scrollable) ── */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">

          {/* ── PROJECTION KPI CARDS ── */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Öngörülen Sayı", val: player.predicted_pts, unit: "PTS", icon: <Trophy size={13} className="text-amber-500" />, color: "text-amber-600 bg-amber-50/70 border-amber-200" },
              { label: "Öngörülen Ribaund", val: player.predicted_reb, unit: "REB", icon: <Shield size={13} className="text-blue-500" />, color: "text-blue-600 bg-blue-50/70 border-blue-200" },
              { label: "Öngörülen Asist", val: player.predicted_ast, unit: "AST", icon: <Users size={13} className="text-emerald-500" />, color: "text-emerald-600 bg-emerald-50/70 border-emerald-200" },
              { label: "Toplam PRA", val: player.predicted_pra, unit: "PRA", icon: <Flame size={13} className="text-violet-500" />, color: "text-violet-600 bg-violet-50/70 border-violet-200" },
            ].map((kpi, i) => (
              <div key={i} className={`p-3 rounded-xl border flex flex-col items-center justify-center text-center ${kpi.color}`}>
                <div className="flex items-center gap-1 mb-1">
                  {kpi.icon}
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">{kpi.unit}</span>
                </div>
                <p className="text-2xl font-black font-mono leading-none">
                  {kpi.val?.toFixed(1)}
                </p>
                <span className="text-[8px] font-bold text-slate-400 mt-1 uppercase">{kpi.label}</span>
              </div>
            ))}
          </div>

          {/* ── DATA-DRIVEN NARRATIVE SCOUTING REPORT ── */}
          <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/40 via-white to-indigo-50/20 p-4 space-y-2.5 shadow-2xs">
            <div className="flex items-center gap-2 text-indigo-700">
              <Info size={16} />
              <h4 className="text-xs font-black uppercase tracking-wider">
                Veriye Dayalı Maç & Form Analizi
              </h4>
            </div>
            <div className="space-y-2 text-xs text-slate-700 leading-relaxed font-normal">
              {narrative.map((paragraph, i) => (
                <p key={i} className="m-0">
                  {paragraph}
                </p>
              ))}
            </div>
          </div>

          {/* ── STAT COMPARISON MATRIX: Season vs Last 5 vs Model ── */}
          {stats5 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart2 size={15} className="text-slate-600" />
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">
                    İstatistiksel Karşılaştırma & Trend
                  </h4>
                </div>
                <span className="text-[10px] font-bold text-slate-400">
                  Son 5 Maç vs Sezon Ort. vs Model
                </span>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 shadow-2xs">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 text-left">Metrik</th>
                      <th className="px-3 py-2 text-right">Sezon Ort.</th>
                      <th className="px-3 py-2 text-right">Son 5 Maç</th>
                      <th className="px-3 py-2 text-right text-indigo-600">Model Tahmini</th>
                      <th className="px-3 py-2 text-right">Trend / Fark</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-semibold">
                    {[
                      {
                        metric: "Sayı (PTS)",
                        season: seasonAverages?.PTS,
                        l5: stats5.pts,
                        model: player.predicted_pts,
                      },
                      {
                        metric: "Ribaund (REB)",
                        season: seasonAverages?.REB,
                        l5: stats5.reb,
                        model: player.predicted_reb,
                      },
                      {
                        metric: "Asist (AST)",
                        season: seasonAverages?.AST,
                        l5: stats5.ast,
                        model: player.predicted_ast,
                      },
                      {
                        metric: "Toplam PRA",
                        season: (seasonAverages?.PTS || 0) + (seasonAverages?.REB || 0) + (seasonAverages?.AST || 0),
                        l5: stats5.pra,
                        model: player.predicted_pra,
                      },
                    ].map((row, idx) => {
                      const base = row.season ?? row.l5;
                      const diff = base ? row.model - base : 0;
                      const isUp = diff > 0.5;
                      const isDown = diff < -0.5;

                      return (
                        <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-3 py-2 text-slate-800 font-bold">{row.metric}</td>
                          <td className="px-3 py-2 text-right text-slate-500 font-mono">
                            {row.season != null ? row.season.toFixed(1) : "-"}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-700 font-mono font-bold">
                            {row.l5.toFixed(1)}
                          </td>
                          <td className="px-3 py-2 text-right text-indigo-700 font-mono font-black">
                            {row.model.toFixed(1)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            <span
                              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                isUp
                                  ? "text-emerald-700 bg-emerald-50"
                                  : isDown
                                  ? "text-rose-700 bg-rose-50"
                                  : "text-slate-500 bg-slate-100"
                              }`}
                            >
                              {isUp ? <TrendingUp size={11} /> : isDown ? <TrendingDown size={11} /> : <Minus size={11} />}
                              {diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── RECENT GAMES LOG (Son Maçlar) ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock size={15} className="text-slate-600" />
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">
                  Son Maç Performansları ({recentGames.length} Maç)
                </h4>
              </div>
              <span className="text-[10px] font-bold text-slate-400">
                Tarih Sıralı Gerçekleşen İstatistikler
              </span>
            </div>

            {loading ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Maç geçmişi yükleniyor...
              </div>
            ) : error ? (
              <div className="p-4 rounded-xl bg-amber-50 text-amber-700 text-xs font-medium">
                {error}
              </div>
            ) : recentGames.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-50 text-slate-400 text-xs text-center">
                Bu sezon için oynanmış maç kaydı bulunamadı.
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200 shadow-2xs">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-[9px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-200">
                    <tr>
                      <th className="px-2.5 py-2 text-left">Tarih</th>
                      <th className="px-2.5 py-2 text-left">Eşleşme</th>
                      <th className="px-2 py-2 text-center">Sonuç</th>
                      <th className="px-2 py-2 text-right">Dk</th>
                      <th className="px-2.5 py-2 text-right text-slate-800">PTS</th>
                      <th className="px-2 py-2 text-right">REB</th>
                      <th className="px-2 py-2 text-right">AST</th>
                      <th className="px-2 py-2 text-right">PRA</th>
                      <th className="px-2 py-2 text-right">FG%</th>
                      <th className="px-2 py-2 text-right">+/-</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recentGames.map((g, idx) => {
                      const isWin = g.WL === "W";
                      const fgPctText = g.FG_PCT != null ? `${(g.FG_PCT * 100).toFixed(0)}%` : "-";
                      const praVal = (g.PTS ?? 0) + (g.REB ?? 0) + (g.AST ?? 0);

                      return (
                        <tr key={idx} className="hover:bg-slate-50/80 transition-colors font-medium">
                          <td className="px-2.5 py-2 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                            {g.GAME_DATE}
                          </td>
                          <td className="px-2.5 py-2 font-bold text-slate-700 whitespace-nowrap">
                            {g.MATCHUP || "-"}
                          </td>
                          <td className="px-2 py-2 text-center">
                            {g.WL ? (
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                                  isWin ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                                }`}
                              >
                                {g.WL}
                              </span>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="px-2 py-2 text-right font-mono text-slate-500">
                            {g.MIN ?? "-"}
                          </td>
                          <td className="px-2.5 py-2 text-right font-black font-mono text-slate-900">
                            {g.PTS ?? "-"}
                          </td>
                          <td className="px-2 py-2 text-right font-semibold font-mono text-slate-600">
                            {g.REB ?? "-"}
                          </td>
                          <td className="px-2 py-2 text-right font-semibold font-mono text-slate-600">
                            {g.AST ?? "-"}
                          </td>
                          <td className="px-2 py-2 text-right font-bold font-mono text-slate-700">
                            {praVal}
                          </td>
                          <td className="px-2 py-2 text-right font-mono text-slate-500">
                            {fgPctText}
                          </td>
                          <td className="px-2 py-2 text-right font-mono text-slate-500">
                            {g.PLUS_MINUS != null ? (g.PLUS_MINUS > 0 ? `+${g.PLUS_MINUS}` : g.PLUS_MINUS) : "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>

        {/* ── FOOTER ── */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <span>Veriler resmi NBA maç kayıtları ve LightGBM model tahminlerine dayanır.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 text-white font-bold hover:bg-slate-700 transition-colors"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
