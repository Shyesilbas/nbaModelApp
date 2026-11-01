import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import PlayerPhoto from "../PlayerPhoto";
import TeamLogo from "../TeamLogo";
import { Badge, Card, Skeleton } from "../common";
import { TEAM_NAME_BY_ABBR, isKnownTeamAbbr } from "../../lib/nbaTeams";
import { fmtPct, fmtStat } from "./format";
import type { PlayerProfile, SeasonAverages } from "./types";
import { useLanguage } from "../../context/LanguageContext";

/* ─────────── Season selector ─────────── */

function SeasonSelector({
  seasons,
  selected,
  onChange,
  teamFor,
}: {
  seasons: string[];
  selected: string;
  onChange: (s: string) => void;
  teamFor: (s: string) => string | null;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = (s: string) => {
    const team = teamFor(s);
    return (
      <>
        {team && <TeamLogo abbr={team} name="" size={20} />}
        <span className="tabular-nums font-medium">{s}</span>
        {team && <span className="text-text-secondary">{team}</span>}
      </>
    );
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Sezon seç, şu an ${selected}`}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-10 items-center gap-2 rounded border border-border bg-background-primary px-3 text-sm text-text-primary hover:border-card-border-hover focus-visible:border-border-focus focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-focus cursor-pointer"
      >
        {label(selected)}
        <ChevronDown size={16} strokeWidth={1.5} className="text-text-muted" aria-hidden="true" />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label="Sezonlar"
          className="absolute right-0 z-50 mt-1 max-h-72 min-w-full overflow-y-auto rounded border border-border bg-background-primary py-1 shadow-md"
        >
          {[...seasons].reverse().map((sn) => (
            <li key={sn} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={sn === selected}
                onClick={() => {
                  onChange(sn);
                  setOpen(false);
                }}
                className="flex h-10 w-full items-center gap-2 px-3 text-left text-sm text-text-primary hover:bg-background-tertiary focus-visible:bg-background-tertiary focus-visible:outline-none cursor-pointer"
              >
                {label(sn)}
                {sn === selected && (
                  <Check size={16} strokeWidth={1.5} className="ml-auto text-text-muted" aria-hidden="true" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ─────────── Stat blocks ─────────── */

function makesOf(made: number | null, att: number | null): string | undefined {
  return made != null && att != null ? `${fmtStat(made)}/${fmtStat(att)}` : undefined;
}

function SeasonStats({ avgs }: { avgs: SeasonAverages }) {
  const { language } = useLanguage();
  const tr = language === "tr";
  const primary = [
    { label: tr ? "Sayı" : "PTS", value: fmtStat(avgs.PTS) },
    { label: tr ? "Ribaund" : "REB", value: fmtStat(avgs.REB) },
    { label: tr ? "Asist" : "AST", value: fmtStat(avgs.AST) },
    { label: tr ? "Dakika" : "MIN", value: fmtStat(avgs.MIN) },
  ];
  const secondary = [
    { label: "FG%", value: fmtPct(avgs.FG_PCT), hint: makesOf(avgs.FGM, avgs.FGA) },
    { label: "3P%", value: fmtPct(avgs.FG3_PCT), hint: makesOf(avgs.FG3M, avgs.FG3A) },
    { label: "FT%", value: fmtPct(avgs.FT_PCT), hint: makesOf(avgs.FTM, avgs.FTA) },
    { label: "STL", value: fmtStat(avgs.STL) },
    { label: "BLK", value: fmtStat(avgs.BLK) },
    { label: "TOV", value: fmtStat(avgs.TOV) },
    { label: "OREB", value: fmtStat(avgs.OREB) },
    { label: "DREB", value: fmtStat(avgs.DREB) },
    { label: "+/-", value: fmtStat(avgs.PLUS_MINUS) },
  ];

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-4 gap-3">
        {primary.map((s) => (
          <div key={s.label}>
            <dt className="text-xs text-text-secondary">{s.label}</dt>
            <dd className="text-2xl font-semibold tabular-nums text-text-primary">{s.value}</dd>
          </div>
        ))}
      </dl>
      <dl className="grid grid-cols-3 gap-x-4 gap-y-2 border-t border-border-light pt-3 sm:grid-cols-5 lg:grid-cols-9">
        {secondary.map((s) => (
          <div key={s.label}>
            <dt className="text-xs text-text-muted">{s.label}</dt>
            <dd className="text-sm font-semibold tabular-nums text-text-primary">{s.value}</dd>
            {s.hint && <p className="text-xs tabular-nums text-text-muted">{s.hint}</p>}
          </div>
        ))}
      </dl>
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Sezon ortalamaları yükleniyor">
      <div className="grid grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-10 w-full rounded" />
        ))}
      </div>
      <Skeleton className="h-12 w-full rounded" />
    </div>
  );
}

/* ─────────── Bio ─────────── */

function draftText(p: PlayerProfile): string {
  if (!p.DRAFT_YEAR) return "Draft edilmedi";
  return [
    p.DRAFT_YEAR,
    p.DRAFT_ROUND ? `${p.DRAFT_ROUND}. tur` : null,
    p.DRAFT_NUMBER ? `${p.DRAFT_NUMBER}. sıra` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/* ─────────── Hero card ─────────── */

interface PlayerHeroCardProps {
  player: PlayerProfile;
  season: string;
  seasons: string[];
  avgs: SeasonAverages | null;
  loading: boolean;
  onSeasonChange: (s: string) => void;
  teamFor: (s: string) => string | null;
}

export default function PlayerHeroCard({
  player,
  season,
  seasons,
  avgs,
  loading,
  onSeasonChange,
  teamFor,
}: PlayerHeroCardProps) {
  const { language } = useLanguage();
  const teams = avgs?.teams && avgs.teams.length > 0 ? avgs.teams : player.CURRENT_TEAM ? [player.CURRENT_TEAM] : [];
  const bio = [
    { label: language === "tr" ? "Boy" : "Height", value: player.HEIGHT },
    { label: language === "tr" ? "Kilo" : "Weight", value: player.WEIGHT ? `${player.WEIGHT} lbs` : null },
    { label: language === "tr" ? "Ülke" : "Country", value: player.COUNTRY },
    { label: language === "tr" ? "Okul" : "College", value: player.COLLEGE },
    { label: "Draft", value: draftText(player) },
  ];
  const hasAverages = avgs != null && avgs.games_total > 0;

  return (
    <Card padding="md" aria-labelledby="player-hero-name">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <PlayerPhoto
            playerId={player.PLAYER_ID}
            name={player.PLAYER_NAME ?? ""}
            size={80}
            className="shrink-0 border border-border"
          />
          <div className="min-w-0 space-y-2">
            <h1 id="player-hero-name" className="text-2xl font-semibold text-text-primary">
              {player.PLAYER_NAME}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {teams.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
                  {teams.map((abbr, i) => (
                    <span key={`${abbr}-${i}`} className="inline-flex items-center gap-2">
                      {i > 0 && (
                        <ChevronRight size={16} strokeWidth={1.5} className="text-text-muted" aria-hidden="true" />
                      )}
                      <TeamLogo abbr={abbr} name="" size={20} />
                      <span>{isKnownTeamAbbr(abbr) ? TEAM_NAME_BY_ABBR[abbr] : abbr}</span>
                    </span>
                  ))}
                </div>
              )}
              {player.OFFICIAL_POSITION && (
                <Badge variant="neutral" size="sm">
                  {player.OFFICIAL_POSITION}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {seasons.length > 0 && (
          <SeasonSelector seasons={seasons} selected={season} onChange={onSeasonChange} teamFor={teamFor} />
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border-light pt-3 sm:grid-cols-3 lg:grid-cols-5">
        {bio.map((b) => (
          <div key={b.label} className="min-w-0">
            <dt className="text-xs text-text-muted">{b.label}</dt>
            <dd className="truncate text-sm text-text-primary" title={b.value ?? undefined}>
              {b.value || "—"}
            </dd>
          </div>
        ))}
      </dl>

      {seasons.length > 0 && (
        <section className="mt-4 space-y-3 border-t border-border-light pt-3" aria-labelledby="player-hero-stats">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 id="player-hero-stats" className="text-sm font-semibold text-text-primary">
                <span className="tabular-nums">{season}</span> {language === "tr" ? "sezon ortalamaları" : "Season Averages"}
              </h2>
              {hasAverages && (
                <Badge variant="neutral" size="sm">
                  <span className="tabular-nums">
                    {avgs.games_played} / {avgs.games_total}
                  </span>{" "}
                  {language === "tr" ? "maç" : "games"}
                </Badge>
              )}
            </div>
            <span className="text-xs text-text-muted">{language === "tr" ? "Maç başına" : "Per game"}</span>
          </div>

          {loading ? (
            <StatsSkeleton />
          ) : hasAverages ? (
            <SeasonStats avgs={avgs} />
          ) : (
            <p className="py-2 text-sm text-text-secondary">
              {language === "tr" ? (
                <>
                  <span className="tabular-nums">{season}</span> sezonu için ortalama verisi bulunamadı.
                </>
              ) : (
                <>
                  No average stats found for the <span className="tabular-nums">{season}</span> season.
                </>
              )}
            </p>
          )}
        </section>
      )}
    </Card>
  );
}
