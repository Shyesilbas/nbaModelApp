import { ChevronRight } from "lucide-react";
import PlayerPhoto from "../PlayerPhoto";
import TeamLogo from "../TeamLogo";
import { Modal, Skeleton } from "../common";
import { PlayerQuarterTable, useGameQuarters } from "../game-results/QuarterBreakdown";
import { TEAM_NAME_BY_ABBR, isKnownTeamAbbr } from "../../lib/nbaTeams";

export interface PlayerGameInfo {
  GAME_ID: string;
  GAME_DATE: string | null;
  SEASON: string;
  MATCHUP: string | null;
  WL: string | null;
  SEASON_TYPE: string | null;
  IS_PLAYOFF: boolean;
  DID_NOT_PLAY: boolean;
  HOME_TEAM_ABBREVIATION: string | null;
  HOME_SCORE: number | null;
  AWAY_TEAM_ABBREVIATION: string | null;
  AWAY_SCORE: number | null;
  MIN?: number | null;
  PTS?: number | null;
  REB?: number | null;
  AST?: number | null;
  STL?: number | null;
  BLK?: number | null;
  TOV?: number | null;
  FGM?: number | null;
  FGA?: number | null;
  FG3M?: number | null;
  FG3A?: number | null;
  FTM?: number | null;
  FTA?: number | null;
  PLUS_MINUS?: number | null;
}

const shots = (m?: number | null, a?: number | null) => (m != null && a != null ? `${m}/${a}` : "—");

export default function PlayerGameCard({
  game,
  playerId,
  playerName,
  onClose,
  onOpenGame,
}: {
  game: PlayerGameInfo | null;
  playerId: number;
  playerName: string;
  onClose: () => void;
  onOpenGame: (gameId: string) => void;
}) {
  const { data, loading } = useGameQuarters(game?.GAME_ID, game?.SEASON);
  if (!game) return null;

  const away = !game.MATCHUP?.includes("vs.");
  const oppAbbr = (away ? game.HOME_TEAM_ABBREVIATION : game.AWAY_TEAM_ABBREVIATION) ?? "";
  const ownScore = away ? game.AWAY_SCORE : game.HOME_SCORE;
  const oppScore = away ? game.HOME_SCORE : game.AWAY_SCORE;
  const oppName = isKnownTeamAbbr(oppAbbr) ? TEAM_NAME_BY_ABBR[oppAbbr] : oppAbbr;
  const date = game.GAME_DATE
    ? new Date(`${game.GAME_DATE}T12:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })
    : "";
  const result = game.WL === "W" ? "Galibiyet" : game.WL === "L" ? "Mağlubiyet" : "";
  const resultTone = game.WL === "W" ? "text-status-success" : game.WL === "L" ? "text-status-error" : "text-text-muted";

  const line = [
    { k: "MIN", v: game.MIN != null ? Math.round(game.MIN) : "—" },
    { k: "PTS", v: game.PTS ?? "—", strong: true },
    { k: "REB", v: game.REB ?? "—", strong: true },
    { k: "AST", v: game.AST ?? "—", strong: true },
    { k: "FG", v: shots(game.FGM, game.FGA) },
    { k: "3P", v: shots(game.FG3M, game.FG3A) },
    { k: "FT", v: shots(game.FTM, game.FTA) },
    { k: "+/-", v: game.PLUS_MINUS != null ? `${game.PLUS_MINUS > 0 ? "+" : ""}${game.PLUS_MINUS}` : "—" },
  ];

  return (
    <Modal isOpen onClose={onClose} maxWidth="xl">
      <div className="space-y-5">
        <div className="flex items-center gap-4 pr-6">
          <PlayerPhoto playerId={playerId} name={playerName} size={56} className="shrink-0 border border-border" />
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-text-primary">{playerName}</h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-text-secondary">
              <span className="text-text-muted">{away ? "@" : "vs"}</span>
              {oppAbbr && <TeamLogo abbr={oppAbbr} name="" size={18} />}
              <span>{oppName}</span>
            </p>
            <p className="mt-0.5 text-xs text-text-muted">
              {[date, game.IS_PLAYOFF ? "Playoff" : game.SEASON_TYPE === "Pre Season" ? "Hazırlık" : null]
                .filter(Boolean)
                .join(" · ")}
              {ownScore != null && oppScore != null && (
                <>
                  {" · "}
                  <span className={`font-semibold ${resultTone}`}>{result}</span>{" "}
                  <span className="tabular-nums">
                    {ownScore} - {oppScore}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        {game.DID_NOT_PLAY ? (
          <p className="text-sm text-text-secondary">Bu maçta oynamadı.</p>
        ) : (
          <>
            <dl className="grid grid-cols-4 gap-x-4 gap-y-3 sm:grid-cols-8">
              {line.map((s) => (
                <div key={s.k}>
                  <dt className="text-xs text-text-muted">{s.k}</dt>
                  <dd className={`tabular-nums text-text-primary ${s.strong ? "text-lg font-semibold" : "text-sm"}`}>
                    {s.v}
                  </dd>
                </div>
              ))}
            </dl>

            <section aria-label="Periyot bazında performans" className="border-t border-border-light pt-4">
              <h3 className="mb-2 text-xs text-text-muted">Periyot bazında performans</h3>
              {loading ? (
                <Skeleton className="h-28 w-full rounded" />
              ) : data && data.players.some((p) => p.player_id === playerId) ? (
                <PlayerQuarterTable data={data} playerId={playerId} />
              ) : (
                <p className="text-xs text-text-muted">
                  Bu maç için periyot verisi yok. Çeyrek bazlı veri yalnızca play-by-play kaydı bulunan maçlarda görünür.
                </p>
              )}
            </section>
          </>
        )}

        <button
          type="button"
          onClick={() => onOpenGame(game.GAME_ID)}
          className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Maç detayını aç
          <ChevronRight size={14} />
        </button>
      </div>
    </Modal>
  );
}
