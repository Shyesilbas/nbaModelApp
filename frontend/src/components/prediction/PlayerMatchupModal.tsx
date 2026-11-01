import { useEffect, useRef, useState, useMemo } from "react";
import { X, Clock } from "lucide-react";
import PlayerPhoto from "../PlayerPhoto";
import { EmptyState, InlineError, Skeleton } from "../common";
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

  const tr = language === "tr";
  const statusText =
    player.status === "OUT" ? { text: "OUT", cls: "text-status-error" }
    : player.status === "RESTRICTED" ? { text: tr ? "Kısıtlı" : "Restricted", cls: "text-status-warning" }
    : player.status === "DOUBTFUL" ? { text: tr ? "Şüpheli" : "Doubtful", cls: "text-status-warning" }
    : player.status === "QUESTIONABLE" ? { text: tr ? "Belirsiz" : "Questionable", cls: "text-status-warning" }
    : null;

  const projection = [
    { unit: "PTS", val: player.predicted_pts, strong: true },
    { unit: "REB", val: player.predicted_reb, strong: false },
    { unit: "AST", val: player.predicted_ast, strong: false },
    { unit: "PRA", val: player.predicted_pra, strong: true },
  ];

  const compareRows = stats5
    ? [
        { metric: "PTS", season: seasonAverages?.PTS, l5: stats5.pts, model: player.predicted_pts },
        { metric: "REB", season: seasonAverages?.REB, l5: stats5.reb, model: player.predicted_reb },
        { metric: "AST", season: seasonAverages?.AST, l5: stats5.ast, model: player.predicted_ast },
        {
          metric: "PRA",
          season: (seasonAverages?.PTS || 0) + (seasonAverages?.REB || 0) + (seasonAverages?.AST || 0),
          l5: stats5.pra,
          model: player.predicted_pra,
        },
      ]
    : [];

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
        <div className="flex items-start justify-between gap-4 border-b border-border-light px-5 py-5 sm:px-6">
          <div className="flex min-w-0 items-center gap-4">
            <PlayerPhoto
              playerId={player.player_id}
              name={player.player_name}
              size={64}
              className="shrink-0 rounded-full border border-border"
            />
            <div className="min-w-0">
              <h2 id="player-matchup-title" className="truncate text-xl font-semibold leading-tight text-text-primary">
                {player.player_name}
              </h2>
              <p className="mt-1 text-xs text-text-secondary">
                {[player.position_group, `${teamInfo.abbr} vs ${opponentInfo.abbr}`].filter(Boolean).join(" · ")}
                {statusText && <span className={`font-medium ${statusText.cls}`}> · {statusText.text}</span>}
              </p>
            </div>
          </div>

          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={tr ? "Kapat" : "Close"}
            title={tr ? "Kapat (Esc)" : "Close (Esc)"}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border text-text-secondary hover:bg-background-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus cursor-pointer"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex-1 space-y-8 overflow-y-auto p-5 sm:p-6">
          <section aria-label={tr ? "Model projeksiyonu" : "Model projection"}>
            <h3 className="text-xs font-medium text-text-muted">{tr ? "Model projeksiyonu" : "Model projection"}</h3>
            <dl className="mt-2 grid grid-cols-4 divide-x divide-border-light">
              {projection.map((s) => (
                <div key={s.unit} className="px-3 first:pl-0">
                  <dd className={`text-2xl font-semibold tabular-nums sm:text-3xl ${s.strong ? "text-text-primary" : "text-text-secondary"}`}>
                    {s.val?.toFixed(1)}
                  </dd>
                  <dt className="mt-0.5 text-xs text-text-muted">{s.unit}</dt>
                </div>
              ))}
            </dl>
          </section>

          <section aria-label={tr ? "Maç ve form analizi" : "Matchup and form analysis"}>
            <h3 className="text-sm font-semibold text-text-primary">{tr ? "Özet" : "Summary"}</h3>
            {loading ? (
              <div className="mt-2 space-y-2" aria-busy="true">
                <Skeleton variant="text" />
                <Skeleton variant="text" />
                <Skeleton variant="text" className="w-2/3" />
              </div>
            ) : (
              <div className="mt-2 space-y-2 text-sm leading-relaxed text-text-secondary">
                {narrative.map((paragraph, i) => (
                  <p key={i} className="m-0">
                    {paragraph}
                  </p>
                ))}
              </div>
            )}
          </section>

          <section aria-label={tr ? "İstatistiksel karşılaştırma" : "Statistical comparison"}>
            <h3 className="text-sm font-semibold text-text-primary">{tr ? "Model, form ve sezon" : "Model, form and season"}</h3>
            {loading ? (
              <Skeleton className="mt-2 h-32 w-full" />
            ) : stats5 ? (
              <div className="mt-2 overflow-x-auto rounded border border-border">
                <table className="w-full text-xs">
                  <thead className="whitespace-nowrap border-b border-border bg-background-tertiary text-text-secondary">
                    <tr>
                      <th scope="col" className="px-3 py-2 text-left font-medium"> </th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">{tr ? "Sezon" : "Season"}</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">
                        {tr ? `Son ${stats5.count}` : `Last ${stats5.count}`}
                      </th>
                      <th scope="col" className="px-3 py-2 text-right font-medium text-text-primary">Model</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">{tr ? "Fark" : "Diff"}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-light tabular-nums">
                    {compareRows.map((row) => {
                      const base = row.season ?? row.l5;
                      const diff = base ? row.model - base : 0;
                      const tone = diff > 0.5 ? "text-status-success" : diff < -0.5 ? "text-status-error" : "text-text-muted";
                      return (
                        <tr key={row.metric}>
                          <th scope="row" className="px-3 py-2.5 text-left font-medium text-text-primary">{row.metric}</th>
                          <td className="px-3 py-2.5 text-right text-text-secondary">
                            {row.season != null ? row.season.toFixed(1) : "–"}
                          </td>
                          <td className="px-3 py-2.5 text-right text-text-secondary">{row.l5.toFixed(1)}</td>
                          <td className="px-3 py-2.5 text-right text-sm font-semibold text-text-primary">{row.model.toFixed(1)}</td>
                          <td className={`px-3 py-2.5 text-right font-medium ${tone}`}>
                            {diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <section aria-label={tr ? "Son maçlar" : "Recent games"}>
            <h3 className="text-sm font-semibold text-text-primary">
              {tr ? "Son maçlar" : "Recent games"}
              {!loading && !error ? ` (${recentGames.length})` : ""}
            </h3>
            {loading ? (
              <div className="mt-2 space-y-2" aria-busy="true">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : error ? (
              <div className="mt-2">
                <InlineError
                  title={tr ? "Oyuncu verisi yüklenemedi" : "Failed to load player data"}
                  message={error}
                  onRetry={() => setReloadKey((k) => k + 1)}
                />
              </div>
            ) : recentGames.length === 0 ? (
              <div className="mt-2">
                <EmptyState
                  title={tr ? "Maç kaydı yok" : "No games recorded"}
                  description={tr ? "Bu sezon için oynanmış maç kaydı bulunamadı." : "No played game records found for this season."}
                  icon={<Clock size={32} strokeWidth={1.5} />}
                  className="p-6 sm:p-6"
                />
              </div>
            ) : (
              <div className="mt-2 overflow-x-auto rounded border border-border">
                <table className="w-full min-w-[480px] text-xs">
                  <thead className="whitespace-nowrap border-b border-border bg-background-tertiary text-text-secondary">
                    <tr>
                      <th scope="col" className="px-3 py-2 text-left font-medium">{tr ? "Maç" : "Game"}</th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">{tr ? "Dk" : "Min"}</th>
                      <th scope="col" className="px-2 py-2 text-right font-medium text-text-primary">PTS</th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">REB</th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">AST</th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">FG%</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">+/-</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-light tabular-nums">
                    {recentGames.map((g) => (
                      <tr key={g.GAME_ID ?? g.GAME_DATE}>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          <span className="font-medium text-text-primary">{g.MATCHUP || "–"}</span>
                          <span className="block text-text-muted">
                            {g.GAME_DATE}
                            {g.WL && (
                              <span className={`font-medium ${g.WL === "W" ? "text-status-success" : "text-status-error"}`}> · {g.WL}</span>
                            )}
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-right text-text-secondary">{g.MIN ?? "–"}</td>
                        <td className="px-2 py-2.5 text-right font-semibold text-text-primary">{g.PTS ?? "–"}</td>
                        <td className="px-2 py-2.5 text-right text-text-secondary">{g.REB ?? "–"}</td>
                        <td className="px-2 py-2.5 text-right text-text-secondary">{g.AST ?? "–"}</td>
                        <td className="px-2 py-2.5 text-right text-text-secondary">
                          {g.FG_PCT != null ? `${(g.FG_PCT * 100).toFixed(0)}%` : "–"}
                        </td>
                        <td className="px-3 py-2.5 text-right text-text-secondary">
                          {g.PLUS_MINUS != null ? (g.PLUS_MINUS > 0 ? `+${g.PLUS_MINUS}` : g.PLUS_MINUS) : "–"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
