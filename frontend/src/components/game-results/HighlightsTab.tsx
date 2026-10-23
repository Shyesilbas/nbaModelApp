import { useEffect, useMemo, useState } from "react";
import {
  Award,
  ArrowRightLeft,
  Clock,
  Flame,
  Sparkles,
  Trophy,
  TrendingUp,
  Zap,
  type LucideIcon,
} from "lucide-react";
import PlayerPhoto from "../PlayerPhoto";
import TeamLogo from "../TeamLogo";
import { loadArchivedPlayByPlay } from "../../lib/archiveData";
import { Badge, Button, Card, EmptyState, InlineError, Skeleton } from "../common";

export interface PbpEvent {
  period: number;
  clock: string;
  action_type: string;
  sub_type: string;
  team: string | null;
  player_id?: number | null;
  player_name: string | null;
  description: string;
  score_home: number;
  score_away: number;
  points_scored: number;
  badges?: string[];
  moment_reasons?: string[];
  moment_detail?: {
    run_team?: string;
    run_points?: number;
    lead_team?: string;
    lead?: number;
  };
}

export interface PbpData {
  game_id: string;
  home_team: string;
  away_team: string;
  quarter_scores: {
    quarter: string;
    home: number;
    away: number;
    home_total: number;
    away_total: number;
  }[];
  events: PbpEvent[];
  summary?: {
    largest_lead?: Record<string, number>;
    comeback_points?: number;
    comeback_team?: string | null;
    second_half_lead_changes?: number;
  };
}

type FilterId = "all" | "runs" | "leads" | "clutch" | "threes" | "milestones";

const RUN_REASONS = ["team_run", "largest_lead"];
const LEAD_REASONS = ["lead_change", "go_ahead", "game_tie", "game_winner"];
const THREE_REASONS = ["back_to_back_3", "player_3_run"];
const MILESTONE_REASONS = [
  "20_pt_game",
  "30_pt_game",
  "40_pt_game",
  "double_double",
  "triple_double",
  "10_ast",
  "15_reb",
  "5_stl",
  "5_blk",
];

const KEY_MOMENT_REASONS = new Set([
  "badge",
  "clutch",
  ...RUN_REASONS,
  ...LEAD_REASONS,
  ...THREE_REASONS,
  ...MILESTONE_REASONS,
]);

const STRONG_REASONS = new Set(["clutch", "game_winner", "team_run", "triple_double", "30_pt_game", "40_pt_game"]);

const FILTERS: { id: FilterId; label: string; reasons: string[] | null }[] = [
  { id: "all", label: "Tümü", reasons: null },
  { id: "runs", label: "Seriler ve farklar", reasons: RUN_REASONS },
  { id: "leads", label: "Liderlik", reasons: LEAD_REASONS },
  { id: "clutch", label: "Clutch", reasons: ["clutch"] },
  { id: "threes", label: "Üçlükler", reasons: THREE_REASONS },
  { id: "milestones", label: "Kilometre taşları", reasons: MILESTONE_REASONS },
];

const BADGE_LABELS: Record<string, string> = {
  "points this quarter": "sayı (çeyrek)",
  "straight team points": "üst üste takım sayısı",
  "assists created": "asist",
  "rebounds secured": "ribaund",
  blocks: "blok",
  steals: "top çalma",
};

const translateBadge = (badge: string) => {
  const m = badge.match(/^(\d+) (.+)$/);
  const label = m ? BADGE_LABELS[m[2]] : undefined;
  return m && label ? `${m[1]} ${label}` : badge;
};

const normalizePbpGameId = (gameId: string) => String(gameId).replace(/\D/g, "").padStart(10, "0");

const periodName = (period: number) => (period <= 4 ? `Q${period}` : `OT${period - 4}`);

interface ReasonMeta {
  label: string;
  icon: LucideIcon;
  className: string;
}

const NEUTRAL = "border-border bg-background-tertiary text-text-secondary";
const WARNING = "border-status-warning/30 bg-status-warning/10 text-status-warning";
const SUCCESS = "border-status-success/30 bg-status-success/10 text-status-success";
const ERROR = "border-status-error/30 bg-status-error/10 text-status-error";
const INFO = "border-status-info/30 bg-status-info/10 text-status-info";
const PRIMARY = "border-primary/25 bg-primary/10 text-primary";

function reasonMeta(reason: string, event: PbpEvent): ReasonMeta {
  const d = event.moment_detail ?? {};
  switch (reason) {
    case "back_to_back_3":
      return { label: "Üst üste üçlük", icon: Flame, className: WARNING };
    case "player_3_run":
      return { label: "Sıcak el: 3 üçlük", icon: Flame, className: WARNING };
    case "lead_change":
      return { label: "Liderlik değişimi", icon: ArrowRightLeft, className: SUCCESS };
    case "go_ahead":
      return { label: "Öne geçiş", icon: ArrowRightLeft, className: SUCCESS };
    case "game_tie":
      return { label: "Beraberlik", icon: ArrowRightLeft, className: NEUTRAL };
    case "game_winner":
      return { label: "Maçın basketi", icon: Trophy, className: ERROR };
    case "clutch":
      return { label: "Clutch", icon: Zap, className: ERROR };
    case "team_run":
      return {
        label: d.run_team && d.run_points ? `${d.run_team} ${d.run_points}-0 seri` : "Skor serisi",
        icon: TrendingUp,
        className: PRIMARY,
      };
    case "largest_lead":
      return {
        label: d.lead_team && d.lead ? `${d.lead_team} +${d.lead} fark` : "En büyük fark",
        icon: TrendingUp,
        className: PRIMARY,
      };
    case "triple_double":
      return { label: "Triple-double", icon: Award, className: INFO };
    case "double_double":
      return { label: "Double-double", icon: Award, className: INFO };
    case "40_pt_game":
      return { label: "40+ sayı", icon: Sparkles, className: INFO };
    case "30_pt_game":
      return { label: "30+ sayı", icon: Sparkles, className: INFO };
    case "20_pt_game":
      return { label: "20+ sayı", icon: Sparkles, className: NEUTRAL };
    case "10_ast":
      return { label: "10 asist", icon: Award, className: NEUTRAL };
    case "15_reb":
      return { label: "15 ribaund", icon: Award, className: NEUTRAL };
    case "5_stl":
      return { label: "5 top çalma", icon: Award, className: NEUTRAL };
    case "5_blk":
      return { label: "5 blok", icon: Award, className: NEUTRAL };
    default:
      return { label: reason.replaceAll("_", " "), icon: Sparkles, className: NEUTRAL };
  }
}

const reasonsOf = (e: PbpEvent) => (e.moment_reasons ?? []).filter((r) => KEY_MOMENT_REASONS.has(r) && r !== "badge");

function SummaryStrip({ data }: { data: PbpData }) {
  const s = data.summary;
  if (!s) return null;
  const leads = Object.entries(s.largest_lead ?? {}).filter(([, v]) => v > 0);
  const items: { label: string; value: string }[] = [];
  if (leads.length > 0) {
    items.push({ label: "En büyük fark", value: leads.map(([team, v]) => `${team} +${v}`).join(" · ") });
  }
  if (s.comeback_points && s.comeback_team) {
    items.push({ label: "Geri dönüş", value: `${s.comeback_team}, ${s.comeback_points} sayı geriden` });
  }
  if (s.second_half_lead_changes != null) {
    items.push({ label: "2. yarıda liderlik değişimi", value: String(s.second_half_lead_changes) });
  }
  if (items.length === 0) return null;
  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {items.map((i) => (
        <div key={i.label} className="rounded border border-border-light bg-background-secondary p-3">
          <dt className="text-xs text-text-secondary">{i.label}</dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-text-primary">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function HighlightsTab({
  gameId,
  season,
  initialData,
}: {
  gameId: string;
  season?: string;
  initialData?: PbpData | null;
}) {
  const [reloadKey, setReloadKey] = useState(0);
  const requestKey = `${gameId}|${season ?? ""}|${reloadKey}`;
  const [result, setResult] = useState<{ key: string; data?: PbpData; error?: string } | null>(null);
  const [filter, setFilter] = useState<FilterId>("all");

  useEffect(() => {
    if (initialData) return;
    let cancelled = false;
    loadArchivedPlayByPlay(normalizePbpGameId(gameId), season)
      .then((data: PbpData) => {
        if (!cancelled) setResult({ key: requestKey, data });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setResult({ key: requestKey, error: e instanceof Error && e.message ? e.message : "Önemli anlar yüklenemedi." });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [gameId, season, initialData, requestKey]);

  const fetched = result?.key === requestKey ? result : null;
  const data = initialData ?? fetched?.data ?? null;
  const error = initialData ? undefined : fetched?.error;
  const loading = !initialData && !fetched;

  const baseEvents = useMemo(() => {
    const events = data?.events ?? [];
    const highlights = events.filter((e) => (e.badges?.length ?? 0) > 0 || reasonsOf(e).length > 0);
    return highlights.length > 0 ? highlights : events.filter((e) => e.points_scored > 0);
  }, [data]);

  const counts = useMemo(() => {
    const out = {} as Record<FilterId, number>;
    FILTERS.forEach((f) => {
      out[f.id] = f.reasons ? baseEvents.filter((e) => reasonsOf(e).some((r) => f.reasons!.includes(r))).length : baseEvents.length;
    });
    return out;
  }, [baseEvents]);

  const visible = useMemo(() => {
    const active = FILTERS.find((f) => f.id === filter);
    if (!active?.reasons) return baseEvents;
    return baseEvents.filter((e) => reasonsOf(e).some((r) => active.reasons!.includes(r)));
  }, [baseEvents, filter]);

  if (loading) {
    return (
      <Card className="space-y-3" aria-busy="true" aria-label="Önemli anlar yükleniyor">
        <Skeleton className="h-12 w-full rounded" />
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded" />
        ))}
      </Card>
    );
  }

  if (error) {
    return <InlineError title="Önemli anlar yüklenemedi" message={error} onRetry={() => setReloadKey((k) => k + 1)} />;
  }

  if (!data) {
    return (
      <EmptyState
        icon={<Clock size={24} strokeWidth={1.5} />}
        title="Önemli anlar yok"
        description="Bu maç için play-by-play verisi henüz hazır değil."
      />
    );
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-col gap-2 border-b border-border-light pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Maçın dönüm noktaları</h3>
          <p className="mt-0.5 text-xs text-text-secondary">
            Skor serileri, ikinci yarıdaki liderlik değişimleri, clutch basketler ve eşiği aşan bireysel performanslar
          </p>
        </div>
        <Badge variant="neutral">
          <span className="tabular-nums">{visible.length}</span> an
        </Badge>
      </div>

      <SummaryStrip data={data} />

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Önemli an filtresi">
        {FILTERS.filter((f) => f.id === "all" || counts[f.id] > 0).map((f) => (
          <Button
            key={f.id}
            size="sm"
            variant={filter === f.id ? "primary" : "secondary"}
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label} <span className="tabular-nums opacity-75">({counts[f.id]})</span>
          </Button>
        ))}
      </div>

      <ol className="max-h-screen divide-y divide-border-light overflow-y-auto">
        {visible.map((e, idx) => {
          const reasons = reasonsOf(e);
          const strong = reasons.some((r) => STRONG_REASONS.has(r));
          const showPeriod = idx === 0 || visible[idx - 1].period !== e.period;
          return (
            <li key={`hl-${e.period}-${e.clock}-${idx}`}>
              {showPeriod && (
                <p className="sticky top-0 bg-background-primary py-2 text-xs font-semibold text-text-secondary">
                  {periodName(e.period)}
                </p>
              )}
              <div className={`flex items-start gap-3 px-2 py-3 ${strong ? "bg-background-secondary" : ""}`}>
                <div className="shrink-0 pt-0.5">
                  {e.player_id ? (
                    <PlayerPhoto playerId={e.player_id} name={e.player_name || "Oyuncu"} size={40} />
                  ) : e.team ? (
                    <TeamLogo abbr={e.team} name="" size={40} />
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background-tertiary text-text-muted">
                      <Clock size={16} strokeWidth={1.5} aria-hidden="true" />
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2">
                    <span className="text-xs font-semibold tabular-nums text-text-secondary">{e.clock}</span>
                    {e.player_name && <span className="text-sm font-semibold text-text-primary">{e.player_name}</span>}
                    {e.team && <span className="text-xs text-text-muted">{e.team}</span>}
                  </div>
                  <p className="mt-0.5 text-xs leading-snug text-text-secondary">{e.description || e.action_type}</p>
                  {(reasons.length > 0 || (e.badges?.length ?? 0) > 0) && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {reasons.map((r) => {
                        const meta = reasonMeta(r, e);
                        const Icon = meta.icon;
                        return (
                          <span
                            key={r}
                            className={`inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-xs font-medium ${meta.className}`}
                          >
                            <Icon size={16} strokeWidth={1.5} className="shrink-0" aria-hidden="true" />
                            {meta.label}
                          </span>
                        );
                      })}
                      {(e.badges ?? []).map((b) => (
                        <span
                          key={b}
                          className={`inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-xs font-medium ${NEUTRAL}`}
                        >
                          <Award size={16} strokeWidth={1.5} className="shrink-0" aria-hidden="true" />
                          {translateBadge(b)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="shrink-0 pt-0.5 text-right">
                  <p className="text-xs font-semibold tabular-nums text-text-primary">
                    {e.score_away} - {e.score_home}
                  </p>
                  {e.points_scored > 0 && (
                    <p className="mt-0.5 text-xs font-semibold tabular-nums text-status-success">+{e.points_scored}</p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {visible.length === 0 && (
        <p className="py-8 text-center text-xs text-text-muted">Seçili filtreye uygun an bulunamadı.</p>
      )}
    </Card>
  );
}
