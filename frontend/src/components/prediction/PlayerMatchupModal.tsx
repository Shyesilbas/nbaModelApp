import { useEffect, useRef, useState, useMemo } from "react";
import { X, TrendingUp, TrendingDown, Minus, Shield, Trophy, Users, Clock, Flame, BarChart2, Info } from "lucide-react";
import PlayerPhoto from "../PlayerPhoto";
import { Badge, Button, EmptyState, InlineError, Skeleton } from "../common";
import { loadPrivateApi } from "../../lib/dataCache";
import type { TeamInfo } from "./types";
import { useLanguage } from "../../context/LanguageContext";

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
  status?: "ACTIVE" | "RESTRICTED" | "QUESTIONABLE" | "DOUBTFUL" | "OUT" | "DNP";
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
  SEASON_TYPE?: string;
}

interface SeasonAverages {
  PTS?: number;
  REB?: number;
  AST?: number;
  MIN?: number;
  FG_PCT?: number;
  GAMES_PLAYED?: number;
}

const EMPTY_GAMES: GameRow[] = [];

export function PlayerMatchupModal({
  player,
  teamInfo,
  opponentInfo,
  gameDate,
  season = "2025-26",
  onClose,
}: PlayerMatchupModalProps) {
  const { language } = useLanguage();
  const [result, setResult] = useState<{
    key: string;
    games: GameRow[];
    seasonAverages: SeasonAverages | null;
    error: string | null;
  } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const requestKey = player ? `${player.player_id}|${season}|${reloadKey}` : "";
  const loading = player != null && result?.key !== requestKey;
  const games = result?.key === requestKey ? result.games : EMPTY_GAMES;
  const seasonAverages = result?.key === requestKey ? result.seasonAverages : null;
  const error = result?.key === requestKey ? result.error : null;
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const isOpen = player != null;

  // Escape closes, Tab stays inside the dialog, focus returns to the opener on close
  useEffect(() => {
    if (!isOpen) return;
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      opener?.focus?.();
    };
  }, [isOpen, onClose]);

  // Fetch player game logs and season averages
  useEffect(() => {
    if (!player) return;

    let isMounted = true;
    const playerId = String(player.player_id);

    const fetchPlayerData = async () => {
      try {
        const payload = await loadPrivateApi<{
          player_id: string;
          games: Record<string, GameRow[]>;
          averages: Record<string, SeasonAverages>;
        }>(`/frontend-data-api/players/${encodeURIComponent(playerId)}`);

        if (!isMounted) return;

        // Recent form comes from the current season only; preseason games stay out, as in the model inputs
        const playedGames = (payload.games?.[season] ?? []).filter(
          (g) => !g.DID_NOT_PLAY && g.SEASON_TYPE !== "Pre Season"
        );
        playedGames.sort((a, b) => b.GAME_DATE.localeCompare(a.GAME_DATE));

        setResult({
          key: requestKey,
          games: playedGames,
          seasonAverages: payload.averages?.[season] ?? null,
          error: null,
        });
      } catch (err) {
        if (!isMounted) return;
        setResult({
          key: requestKey,
          games: [],
          seasonAverages: null,
          error: err instanceof Error && err.message ? err.message : "Oyuncu verisi yüklenemedi.",
        });
      }
    };

    fetchPlayerData();

    return () => {
      isMounted = false;
    };
  }, [player, season, requestKey]);

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
    if (stats5 && stats5.count >= 1) {
      const diffPct = ptsSeason > 0 ? ((ptsProj - ptsSeason) / ptsSeason) * 100 : 0;
      const formDiff = ((stats5.pts - ptsSeason) / Math.max(ptsSeason, 1)) * 100;

      let trendWord = language === "tr" ? "istikrarlı bir çizgide" : "at a consistent pace";
      if (formDiff > 10) trendWord = language === "tr" ? "belirgin bir yükseliş trendinde (sıcak form)" : "in an ascending hot-streak";
      else if (formDiff < -10) trendWord = language === "tr" ? "son dönemde hafif bir düşüş grafiğinde" : "in a slight recent cooldown";

      if (language === "tr") {
        parts.push(
          `Son ${stats5.count} maçında ortalama ${stats5.pts.toFixed(1)} sayı, ${stats5.reb.toFixed(1)} ribaund ve ${stats5.ast.toFixed(1)} asist (` +
          `${stats5.min.toFixed(1)} dk, %${((stats5.fgPct || 0) * 100).toFixed(0)} FG) ile ${trendWord} oynuyor. Sezon ortalaması ise ${ptsSeason.toFixed(1)} PTS.`
        );
      } else {
        parts.push(
          `Averaging ${stats5.pts.toFixed(1)} PTS, ${stats5.reb.toFixed(1)} REB, and ${stats5.ast.toFixed(1)} AST (` +
          `${stats5.min.toFixed(1)} MIN, ${((stats5.fgPct || 0) * 100).toFixed(0)}% FG) over the last ${stats5.count} games, performing ${trendWord}. Season benchmark is ${ptsSeason.toFixed(1)} PTS.`
        );
      }

      if (Math.abs(diffPct) >= 5) {
        if (language === "tr") {
          const dir = diffPct > 0 ? "artış" : "azalış";
          parts.push(
            `Model bu maç için ${ptsProj.toFixed(1)} sayı (${diffPct > 0 ? "+" : ""}${diffPct.toFixed(1)}% ${dir}) öngörmektedir. ` +
            `Bu projeksiyon; takımın beklenen maç temposu (${teamInfo.abbr} - ${opponentInfo.abbr}) ve oyuncunun kullanım hacmi (USG) ile doğrudan ilişkilidir.`
          );
        } else {
          const dir = diffPct > 0 ? "surge" : "dip";
          parts.push(
            `The model projects ${ptsProj.toFixed(1)} PTS (${diffPct > 0 ? "+" : ""}${diffPct.toFixed(1)}% ${dir}) for this matchup. ` +
            `This projection directly incorporates matchup pace dynamics (${teamInfo.abbr} vs ${opponentInfo.abbr}) and implied offensive usage.`
          );
        }
      } else {
        parts.push(
          language === "tr"
            ? `Modelin ${ptsProj.toFixed(1)} sayı tahmini, oyuncunun temel sezon standartlarıyla dengeli bir uyum göstermektedir.`
            : `The model's projection of ${ptsProj.toFixed(1)} PTS closely tracks the player's core season baseline.`
        );
      }
    } else if (!seasonAverages) {
      parts.push(
        language === "tr"
          ? "Bu sezon için henüz oynanmış maç verisi yok; projeksiyon önceki sezonlardaki role ve güncel kadro bağlamına dayanır."
          : "No games recorded yet for this season; projections rely on historical role depth and roster environment."
      );
    } else {
      parts.push(
        language === "tr"
          ? `Sezon genelinde ${ptsSeason.toFixed(1)} sayı, ${seasonAverages?.REB?.toFixed(1) || 0} ribaund ve ${seasonAverages?.AST?.toFixed(1) || 0} asist ortalamasına sahip.`
          : `Holding season-long averages of ${ptsSeason.toFixed(1)} PTS, ${seasonAverages?.REB?.toFixed(1) || 0} REB, and ${seasonAverages?.AST?.toFixed(1) || 0} AST.`
      );
    }

    // 2. Position group and matchup context
    const pos = player.position_group || (language === "tr" ? "Oyuncu" : "Player");
    parts.push(
      language === "tr"
        ? `${opponentInfo.name} (${opponentInfo.abbr}) savunmasına karşı ${pos} pozisyonunda ana hücum/rotasyon aktörü olarak sahada yer alması bekleniyor.`
        : `Expected to feature as a primary rotation/offensive contributor at ${pos} against the ${opponentInfo.name} (${opponentInfo.abbr}) defense.`
    );

    // 3. Top-down scaling context if present
    if (player.scale_factor && player.raw_pts && Math.abs(player.scale_factor - 1) >= 0.005) {
      const scalePercent = ((player.scale_factor - 1) * 100).toFixed(1);
      const isPositive = player.scale_factor >= 1.0;
      parts.push(
        language === "tr"
          ? `Skor modeli senkronizasyonu: Ham bireysel model tahmini ${player.raw_pts.toFixed(1)} PTS iken, ` +
            `takımın hedeflenen maç skoru doğrultusunda ${player.scale_factor.toFixed(3)}x katsayısı (${isPositive ? "+" : ""}${scalePercent}%) uygulanarak ${player.predicted_pts.toFixed(1)} PTS olarak kalibre edilmiştir.`
          : `Score model synchronization: Unconstrained individual projection was ${player.raw_pts.toFixed(1)} PTS, ` +
            `calibrated by ${player.scale_factor.toFixed(3)}x (${isPositive ? "+" : ""}${scalePercent}%) to match projected team totals at ${player.predicted_pts.toFixed(1)} PTS.`
      );
    }

    return parts;
  }, [player, stats5, seasonAverages, teamInfo, opponentInfo]);

  if (!player) return null;

  const kpis = [
    { label: "Öngörülen sayı", val: player.predicted_pts, unit: "PTS", icon: <Trophy size={16} strokeWidth={1.5} /> },
    { label: "Öngörülen ribaund", val: player.predicted_reb, unit: "REB", icon: <Shield size={16} strokeWidth={1.5} /> },
    { label: "Öngörülen asist", val: player.predicted_ast, unit: "AST", icon: <Users size={16} strokeWidth={1.5} /> },
    { label: "Toplam PRA", val: player.predicted_pra, unit: "PRA", icon: <Flame size={16} strokeWidth={1.5} /> },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="player-matchup-title"
        className="relative flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-md border border-border bg-background-primary text-text-primary shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border-light bg-background-secondary px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-4">
            <PlayerPhoto
              playerId={player.player_id}
              name={player.player_name}
              size={52}
              className="shrink-0 rounded-full border border-border"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="neutral">{player.position_group}</Badge>
                <span className="text-xs font-medium text-text-secondary">
                  {teamInfo.abbr} vs {opponentInfo.abbr}
                </span>
              </div>
              <h2 id="player-matchup-title" className="mt-1 truncate text-lg font-semibold leading-tight text-text-primary">
                {player.player_name}
              </h2>
              <p className="text-xs text-text-secondary">Maç raporu ve projeksiyon detayı</p>
            </div>
          </div>

          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            title="Kapat (Esc)"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border bg-background-primary text-text-secondary hover:bg-background-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {kpis.map((kpi) => (
              <div
                key={kpi.unit}
                className="flex flex-col items-center justify-center rounded border border-border bg-background-secondary p-3 text-center"
              >
                <div className="mb-1 flex items-center gap-1 text-text-secondary">
                  {kpi.icon}
                  <span className="text-xs font-medium">{kpi.unit}</span>
                </div>
                <p className="text-2xl font-semibold leading-none tabular-nums text-text-primary">
                  {kpi.val?.toFixed(1)}
                </p>
                <span className="mt-1 text-xs text-text-secondary">{kpi.label}</span>
              </div>
            ))}
          </div>

          {/* Narrative */}
          <section className="space-y-2 rounded border border-border bg-background-secondary p-4" aria-label={language === "tr" ? "Maç ve form analizi" : "Matchup and form analysis"}>
            <div className="flex items-center gap-2">
              <Info size={16} strokeWidth={1.5} className="text-primary" />
              <h3 className="text-sm font-semibold text-text-primary">
                {language === "tr" ? "Maç ve form analizi" : "Matchup & Form Analysis"}
              </h3>
            </div>
            {loading ? (
              <div className="space-y-2" aria-busy="true">
                <Skeleton variant="text" />
                <Skeleton variant="text" />
                <Skeleton variant="text" className="w-2/3" />
              </div>
            ) : (
              <div className="space-y-1.5 text-xs leading-relaxed text-text-secondary">
                {narrative.map((paragraph, i) => (
                  <p key={i} className="m-0">
                    {paragraph}
                  </p>
                ))}
              </div>
            )}
          </section>

          {/* Stat comparison */}
          <section className="space-y-3" aria-label={language === "tr" ? "İstatistiksel karşılaştırma" : "Statistical Comparison"}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <BarChart2 size={16} strokeWidth={1.5} className="text-text-primary" />
                <h3 className="text-sm font-semibold text-text-primary">
                  {language === "tr" ? "İstatistiksel karşılaştırma" : "Statistical Comparison"}
                </h3>
              </div>
              <span className="text-xs text-text-secondary">
                {language === "tr" ? "Son maçlar, sezon ortalaması ve model" : "Recent games, season benchmark, and projections"}
              </span>
            </div>

            {loading ? (
              <Skeleton className="h-32 w-full" />
            ) : stats5 ? (
              <div className="overflow-x-auto rounded border border-border bg-background-primary">
                <table className="w-full text-xs">
                  <thead className="whitespace-nowrap border-b border-border bg-background-tertiary text-xs font-medium text-text-secondary">
                    <tr>
                      <th scope="col" className="px-3 py-2 text-left">{language === "tr" ? "Metrik" : "Metric"}</th>
                      <th scope="col" className="px-3 py-2 text-right">{language === "tr" ? "Sezon ort." : "Season Avg"}</th>
                      <th scope="col" className="px-3 py-2 text-right">
                        {language === "tr" ? `Son ${stats5.count} maç` : `Last ${stats5.count}`}
                      </th>
                      <th scope="col" className="px-3 py-2 text-right text-primary">Model</th>
                      <th scope="col" className="px-3 py-2 text-right">{language === "tr" ? "Fark" : "Diff"}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-light">
                    {[
                      { metric: language === "tr" ? "Sayı (PTS)" : "Points (PTS)", season: seasonAverages?.PTS, l5: stats5.pts, model: player.predicted_pts },
                      { metric: language === "tr" ? "Ribaund (REB)" : "Rebounds (REB)", season: seasonAverages?.REB, l5: stats5.reb, model: player.predicted_reb },
                      { metric: language === "tr" ? "Asist (AST)" : "Assists (AST)", season: seasonAverages?.AST, l5: stats5.ast, model: player.predicted_ast },
                      {
                        metric: language === "tr" ? "Toplam PRA" : "Total PRA",
                        season: (seasonAverages?.PTS || 0) + (seasonAverages?.REB || 0) + (seasonAverages?.AST || 0),
                        l5: stats5.pra,
                        model: player.predicted_pra,
                      },
                    ].map((row) => {
                      const base = row.season ?? row.l5;
                      const diff = base ? row.model - base : 0;
                      const isUp = diff > 0.5;
                      const isDown = diff < -0.5;

                      return (
                        <tr key={row.metric} className="hover:bg-background-secondary">
                          <th scope="row" className="px-3 py-2 text-left font-medium text-text-primary">{row.metric}</th>
                          <td className="px-3 py-2 text-right tabular-nums text-text-secondary">
                            {row.season != null ? row.season.toFixed(1) : "-"}
                          </td>
                          <td className="px-3 py-2 text-right font-medium tabular-nums text-text-primary">
                            {row.l5.toFixed(1)}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums text-primary">
                            {row.model.toFixed(1)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            <Badge variant={isUp ? "success" : isDown ? "error" : "neutral"}>
                              {isUp ? (
                                <TrendingUp size={16} strokeWidth={1.5} aria-hidden="true" />
                              ) : isDown ? (
                                <TrendingDown size={16} strokeWidth={1.5} aria-hidden="true" />
                              ) : (
                                <Minus size={16} strokeWidth={1.5} aria-hidden="true" />
                              )}
                              {diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          {/* Recent games */}
          <section className="space-y-3" aria-label={language === "tr" ? "Son maç performansları" : "Recent Game Performances"}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Clock size={16} strokeWidth={1.5} className="text-text-primary" />
                <h3 className="text-sm font-semibold text-text-primary">
                  {language === "tr" ? "Son maç performansları" : "Recent Game Performances"}
                  {!loading && !error ? ` (${recentGames.length} ${language === "tr" ? "maç" : "games"})` : ""}
                </h3>
              </div>
              <span className="text-xs text-text-secondary">
                {language === "tr" ? "Bu sezonun gerçekleşen istatistikleri" : "Actual box scores from this season"}
              </span>
            </div>

            {loading ? (
              <div className="space-y-2" aria-busy="true">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : error ? (
              <InlineError
                title={language === "tr" ? "Oyuncu verisi yüklenemedi" : "Failed to load player data"}
                message={error}
                onRetry={() => setReloadKey((k) => k + 1)}
              />
            ) : recentGames.length === 0 ? (
              <EmptyState
                title={language === "tr" ? "Maç kaydı yok" : "No games recorded"}
                description={language === "tr" ? "Bu sezon için oynanmış maç kaydı bulunamadı." : "No played game records found for this season."}
                icon={<Clock size={32} strokeWidth={1.5} />}
                className="p-6 sm:p-6"
              />
            ) : (
              <div className="overflow-x-auto rounded border border-border bg-background-primary">
                <table className="w-full text-xs">
                  <thead className="whitespace-nowrap border-b border-border bg-background-tertiary text-xs font-medium text-text-secondary">
                    <tr>
                      <th scope="col" className="px-3 py-2 text-left">{language === "tr" ? "Tarih" : "Date"}</th>
                      <th scope="col" className="px-3 py-2 text-left">{language === "tr" ? "Eşleşme" : "Matchup"}</th>
                      <th scope="col" className="px-2 py-2 text-center">{language === "tr" ? "Sonuç" : "Result"}</th>
                      <th scope="col" className="px-2 py-2 text-right">{language === "tr" ? "Dk" : "Min"}</th>
                      <th scope="col" className="px-3 py-2 text-right text-text-primary">PTS</th>
                      <th scope="col" className="px-2 py-2 text-right">REB</th>
                      <th scope="col" className="px-2 py-2 text-right">AST</th>
                      <th scope="col" className="px-2 py-2 text-right text-primary">PRA</th>
                      <th scope="col" className="px-2 py-2 text-right">FG%</th>
                      <th scope="col" className="px-2 py-2 text-right">+/-</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-light">
                    {recentGames.map((g) => {
                      const fgPctText = g.FG_PCT != null ? `%${(g.FG_PCT * 100).toFixed(0)}` : "-";
                      const praVal = (g.PTS ?? 0) + (g.REB ?? 0) + (g.AST ?? 0);

                      return (
                        <tr key={g.GAME_ID ?? g.GAME_DATE} className="hover:bg-background-secondary">
                          <td className="whitespace-nowrap px-3 py-2 tabular-nums text-text-secondary">{g.GAME_DATE}</td>
                          <td className="whitespace-nowrap px-3 py-2 font-medium text-text-primary">{g.MATCHUP || "-"}</td>
                          <td className="px-2 py-2 text-center">
                            {g.WL ? (
                              <Badge variant={g.WL === "W" ? "success" : "error"} size="sm">
                                {g.WL}
                              </Badge>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-text-secondary">{g.MIN ?? "-"}</td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums text-text-primary">{g.PTS ?? "-"}</td>
                          <td className="px-2 py-2 text-right tabular-nums text-text-secondary">{g.REB ?? "-"}</td>
                          <td className="px-2 py-2 text-right tabular-nums text-text-secondary">{g.AST ?? "-"}</td>
                          <td className="px-2 py-2 text-right font-semibold tabular-nums text-primary">{praVal}</td>
                          <td className="px-2 py-2 text-right tabular-nums text-text-secondary">{fgPctText}</td>
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
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-border-light bg-background-secondary px-4 py-3 sm:px-6">
          <span className="text-xs text-text-secondary">
            Veriler resmi NBA maç kayıtları ve LightGBM model tahminlerine dayanır.
          </span>
          <Button variant="secondary" size="sm" onClick={onClose} className="shrink-0">
            Kapat
          </Button>
        </div>
      </div>
    </div>
  );
}
