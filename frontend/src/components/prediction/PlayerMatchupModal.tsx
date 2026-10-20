import { useEffect, useState, useMemo } from "react";
import { X, TrendingUp, TrendingDown, Minus, Shield, Trophy, Users, Clock, Flame, BarChart2, Info } from "lucide-react";
import PlayerPhoto from "../PlayerPhoto";
import { loadPrivateApi } from "../../lib/dataCache";
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
  status?: "ACTIVE" | "RESTRICTED" | "OUT" | "DNP";
  predicted_min?: number;
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
      } catch (err: any) {
        if (!isMounted) return;
        setError(err.message || "Oyuncu verisi yüklenemedi.");
        setLoading(false);
      }
    };

    fetchPlayerData();

    return () => {
      isMounted = false;
    };
  }, [player, season]);

  // Filter games before the target gameDate if supplied, otherwise take latest
  const recentGames = useMemo(() => {
    if (!games || games.length === 0) return [];
    let filtered = games;
    if (gameDate) {
      filtered = filtered.filter((g) => g.GAME_DATE <= gameDate);
    }
    return filtered.slice(0, 5);
  }, [games, gameDate]);

  // Compute last 5 averages
  const stats5 = useMemo(() => {
    if (recentGames.length === 0) return null;
    const count = recentGames.length;
    const pts = recentGames.reduce((acc, g) => acc + (g.PTS || 0), 0) / count;
    const reb = recentGames.reduce((acc, g) => acc + (g.REB || 0), 0) / count;
    const ast = recentGames.reduce((acc, g) => acc + (g.AST || 0), 0) / count;
    const min = recentGames.reduce((acc, g) => acc + (g.MIN || 0), 0) / count;
    const pra = pts + reb + ast;
    const fgPctSum = recentGames.reduce((acc, g) => acc + (g.FG_PCT || 0), 0);
    const fgPct = count > 0 ? fgPctSum / count : 0;

    return { pts, reb, ast, min, pra, fgPct, count };
  }, [recentGames]);

  // Synthesize narrative scouting commentary
  const narrative = useMemo(() => {
    if (!player) return [];
    const parts: string[] = [];

    const ptsProj = player.predicted_pts;
    const ptsSeason = seasonAverages?.PTS || 0;

    // 1. Scoring & recent trend analysis
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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-background-primary rounded-md shadow-md border border-border overflow-hidden text-text-primary"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-border-light flex items-center justify-between bg-background-secondary">
          <div className="flex items-center gap-4">
            <PlayerPhoto
              playerId={player.player_id}
              name={player.player_name}
              size={52}
              className="rounded-full border border-border"
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium px-2 py-0.5 rounded-sm bg-background-primary border border-border text-text-secondary">
                  {player.position_group}
                </span>
                <span className="text-xs font-medium text-text-secondary uppercase">
                  {teamInfo.abbr} vs {opponentInfo.abbr}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-text-primary mt-0.5 leading-tight">
                {player.player_name}
              </h3>
              <p className="text-xs text-text-secondary">
                Veriye Dayalı Maç Raporu ve Projeksiyon Detayı
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded border border-border bg-background-primary hover:bg-background-secondary text-text-secondary hover:text-text-primary flex items-center justify-center transition-colors cursor-pointer"
            title="Kapat (ESC)"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Öngörülen Sayı", val: player.predicted_pts, unit: "PTS", icon: <Trophy size={14} /> },
              { label: "Öngörülen Ribaund", val: player.predicted_reb, unit: "REB", icon: <Shield size={14} /> },
              { label: "Öngörülen Asist", val: player.predicted_ast, unit: "AST", icon: <Users size={14} /> },
              { label: "Toplam PRA", val: player.predicted_pra, unit: "PRA", icon: <Flame size={14} /> },
            ].map((kpi, i) => (
              <div key={i} className="p-3 rounded border border-border bg-background-secondary flex flex-col items-center justify-center text-center">
                <div className="flex items-center gap-1 text-text-secondary mb-1">
                  {kpi.icon}
                  <span className="text-xs font-medium text-text-secondary">{kpi.unit}</span>
                </div>
                <p className="text-2xl font-semibold tabular-nums text-text-primary leading-none">
                  {kpi.val?.toFixed(1)}
                </p>
                <span className="text-xs text-text-secondary mt-1">{kpi.label}</span>
              </div>
            ))}
          </div>

          {/* Narrative Scouting Report */}
          <div className="rounded border border-border bg-background-secondary p-4 space-y-2">
            <div className="flex items-center gap-2 text-text-primary">
              <Info size={16} className="text-primary" />
              <h4 className="text-xs font-semibold text-text-primary">
                Veriye Dayalı Maç ve Form Analizi
              </h4>
            </div>
            <div className="space-y-1.5 text-xs text-text-secondary leading-relaxed">
              {narrative.map((paragraph, i) => (
                <p key={i} className="m-0">
                  {paragraph}
                </p>
              ))}
            </div>
          </div>

          {/* Stat Comparison Matrix */}
          {stats5 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-text-primary">
                  <BarChart2 size={16} />
                  <h4 className="text-xs font-semibold text-text-primary">
                    İstatistiksel Karşılaştırma ve Trend
                  </h4>
                </div>
                <span className="text-xs text-text-secondary">
                  Son 5 Maç vs Sezon Ort. vs Model
                </span>
              </div>

              <div className="overflow-hidden rounded border border-border bg-background-primary">
                <table className="w-full text-xs">
                  <thead className="bg-background-secondary text-xs font-medium text-text-secondary border-b border-border">
                    <tr>
                      <th className="px-3 py-2 text-left">Metrik</th>
                      <th className="px-3 py-2 text-right">Sezon Ort.</th>
                      <th className="px-3 py-2 text-right">Son 5 Maç</th>
                      <th className="px-3 py-2 text-right text-primary">Model Tahmini</th>
                      <th className="px-3 py-2 text-right">Fark / Trend</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-light">
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
                        <tr key={idx} className="hover:bg-background-secondary/60 transition-colors">
                          <td className="px-3 py-2 text-text-primary font-medium">{row.metric}</td>
                          <td className="px-3 py-2 text-right text-text-secondary tabular-nums">
                            {row.season != null ? row.season.toFixed(1) : "-"}
                          </td>
                          <td className="px-3 py-2 text-right text-text-primary font-medium tabular-nums">
                            {row.l5.toFixed(1)}
                          </td>
                          <td className="px-3 py-2 text-right text-primary font-semibold tabular-nums">
                            {row.model.toFixed(1)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            <span
                              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-sm text-xs font-medium ${
                                isUp
                                  ? "text-status-success bg-status-success/10"
                                  : isDown
                                  ? "text-status-error bg-status-error/10"
                                  : "text-text-secondary bg-background-secondary"
                              }`}
                            >
                              {isUp ? <TrendingUp size={12} /> : isDown ? <TrendingDown size={12} /> : <Minus size={12} />}
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

          {/* Recent Games Log */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-text-primary">
                <Clock size={16} />
                <h4 className="text-xs font-semibold text-text-primary">
                  Son Maç Performansları ({recentGames.length} Maç)
                </h4>
              </div>
              <span className="text-xs text-text-secondary">
                Tarih Sıralı Gerçekleşen İstatistikler
              </span>
            </div>

            {loading ? (
              <div className="p-8 text-center text-xs text-text-secondary">
                Maç geçmişi yükleniyor
              </div>
            ) : error ? (
              <div className="p-4 rounded border border-status-warning/20 bg-status-warning/10 text-status-warning text-xs font-medium">
                {error}
              </div>
            ) : recentGames.length === 0 ? (
              <div className="p-4 rounded border border-border bg-background-secondary text-text-secondary text-xs text-center">
                Bu sezon için oynanmış maç kaydı bulunamadı.
              </div>
            ) : (
              <div className="overflow-hidden rounded border border-border bg-background-primary">
                <table className="w-full text-xs">
                  <thead className="bg-background-secondary text-xs font-medium text-text-secondary border-b border-border">
                    <tr>
                      <th className="px-2.5 py-2 text-left">Tarih</th>
                      <th className="px-2.5 py-2 text-left">Eşleşme</th>
                      <th className="px-2 py-2 text-center">Sonuç</th>
                      <th className="px-2 py-2 text-right">Dk</th>
                      <th className="px-2.5 py-2 text-right text-text-primary">PTS</th>
                      <th className="px-2 py-2 text-right">REB</th>
                      <th className="px-2 py-2 text-right">AST</th>
                      <th className="px-2 py-2 text-right text-primary">PRA</th>
                      <th className="px-2 py-2 text-right">FG%</th>
                      <th className="px-2 py-2 text-right">+/-</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-light">
                    {recentGames.map((g, idx) => {
                      const isWin = g.WL === "W";
                      const fgPctText = g.FG_PCT != null ? `%${(g.FG_PCT * 100).toFixed(0)}` : "-";
                      const praVal = (g.PTS ?? 0) + (g.REB ?? 0) + (g.AST ?? 0);

                      return (
                        <tr key={idx} className="hover:bg-background-secondary/60 transition-colors">
                          <td className="px-2.5 py-2 text-text-secondary tabular-nums whitespace-nowrap">
                            {g.GAME_DATE}
                          </td>
                          <td className="px-2.5 py-2 font-medium text-text-primary whitespace-nowrap">
                            {g.MATCHUP || "-"}
                          </td>
                          <td className="px-2 py-2 text-center">
                            {g.WL ? (
                              <span
                                className={`px-1.5 py-0.5 rounded-sm text-xs font-semibold uppercase ${
                                  isWin ? "bg-status-success/10 text-status-success" : "bg-status-error/10 text-status-error"
                                }`}
                              >
                                {g.WL}
                              </span>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-text-secondary">
                            {g.MIN ?? "-"}
                          </td>
                          <td className="px-2.5 py-2 text-right font-semibold tabular-nums text-text-primary">
                            {g.PTS ?? "-"}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-text-secondary">
                            {g.REB ?? "-"}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-text-secondary">
                            {g.AST ?? "-"}
                          </td>
                          <td className="px-2 py-2 text-right font-semibold tabular-nums text-primary">
                            {praVal}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-text-secondary">
                            {fgPctText}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-text-secondary">
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

        {/* Footer */}
        <div className="px-6 py-3 bg-background-secondary border-t border-border-light flex items-center justify-between text-xs text-text-secondary">
          <span>Veriler resmi NBA maç kayıtları ve LightGBM model tahminlerine dayanır.</span>
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-4 rounded border border-border bg-background-primary hover:bg-background-secondary text-text-primary font-medium text-xs transition-colors cursor-pointer"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
