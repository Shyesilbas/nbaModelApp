import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import PlayerPhoto from "../PlayerPhoto";
import TeamLogo from "../TeamLogo";
import { Badge, Card, Skeleton } from "../common";
import { TEAM_NAME_BY_ABBR, isKnownTeamAbbr } from "../../lib/nbaTeams";
import { fmtPct, fmtStat } from "./format";
import type { PlayerProfile, SeasonAverages } from "./types";

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

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded border border-border-light bg-background-secondary p-3">
      <dt className="text-xs text-text-secondary">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums text-text-primary">{value}</dd>
      {hint && <p className="mt-0.5 text-xs tabular-nums text-text-muted">{hint}</p>}
    </div>
  );
}

function makesOf(made: number | null, att: number | null): string | undefined {
  return made != null && att != null ? `${fmtStat(made)} / ${fmtStat(att)} maç başı` : undefined;
}

function SeasonStats({ avgs }: { avgs: SeasonAverages }) {
  const supporting = [
    { label: "Top çalma", value: fmtStat(avgs.STL) },
    { label: "Blok", value: fmtStat(avgs.BLK) },
    { label: "Top kaybı", value: fmtStat(avgs.TOV) },
    { label: "Hücum ribaundu", value: fmtStat(avgs.OREB) },
    { label: "Savunma ribaundu", value: fmtStat(avgs.DREB) },
    { label: "Artı/eksi", value: fmtStat(avgs.PLUS_MINUS) },
  ];

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Sayı" value={fmtStat(avgs.PTS)} />
        <StatTile label="Ribaund" value={fmtStat(avgs.REB)} />
        <StatTile label="Asist" value={fmtStat(avgs.AST)} />
        <StatTile label="Dakika" value={fmtStat(avgs.MIN)} />
      </dl>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Saha içi isabet" value={fmtPct(avgs.FG_PCT)} hint={makesOf(avgs.FGM, avgs.FGA)} />
        <StatTile label="3 sayılık isabet" value={fmtPct(avgs.FG3_PCT)} hint={makesOf(avgs.FG3M, avgs.FG3A)} />
        <StatTile label="Serbest atış isabet" value={fmtPct(avgs.FT_PCT)} hint={makesOf(avgs.FTM, avgs.FTA)} />
      </dl>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded border border-border-light px-4 py-3 sm:grid-cols-3 lg:grid-cols-6">
        {supporting.map((s) => (
          <div key={s.label}>
            <dt className="text-xs text-text-muted">{s.label}</dt>
            <dd className="text-sm font-semibold tabular-nums text-text-primary">{s.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Sezon ortalamaları yükleniyor">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded" />
        ))}
      </div>
      <Skeleton className="h-16 w-full rounded" />
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
  const teams = avgs?.teams && avgs.teams.length > 0 ? avgs.teams : player.CURRENT_TEAM ? [player.CURRENT_TEAM] : [];
  const bio = [
    { label: "Boy", value: player.HEIGHT },
    { label: "Kilo", value: player.WEIGHT ? `${player.WEIGHT} lbs` : null },
    { label: "Ülke", value: player.COUNTRY },
    { label: "Okul", value: player.COLLEGE },
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

      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border-light pt-4 sm:grid-cols-3 lg:grid-cols-5">
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
        <section className="mt-5 space-y-3 border-t border-border-light pt-4" aria-labelledby="player-hero-stats">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 id="player-hero-stats" className="text-sm font-semibold text-text-primary">
                <span className="tabular-nums">{season}</span> sezon ortalamaları
              </h2>
              {hasAverages && (
                <Badge variant="neutral" size="sm">
                  <span className="tabular-nums">
                    {avgs.games_played} / {avgs.games_total}
                  </span>{" "}
                  maç
                </Badge>
              )}
            </div>
            <span className="text-xs text-text-muted">Maç başına</span>
          </div>

          {loading ? (
            <StatsSkeleton />
          ) : hasAverages ? (
            <SeasonStats avgs={avgs} />
          ) : (
            <p className="py-2 text-sm text-text-secondary">
              <span className="tabular-nums">{season}</span> sezonu için ortalama verisi bulunamadı.
            </p>
          )}
        </section>
      )}
    </Card>
  );
}
