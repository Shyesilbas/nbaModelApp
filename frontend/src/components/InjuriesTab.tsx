import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Calendar,
  Search,
  X,
  Stethoscope,
  Filter,
  ArrowRightLeft,
  Flame,
} from "lucide-react";
import { Badge, Button, Card, EmptyState, InlineError, Skeleton } from "./common";
import TeamLogo from "./TeamLogo";
import PlayerPhoto from "./PlayerPhoto";
import { loadPrivateApiFresh } from "../lib/dataCache";
import { CURRENT_SEASON } from "../lib/constants";
import { fmtDate } from "./game-results/utils";

type InjuredPlayer = {
  team: string;
  player_name: string;
  player_id?: number | null;
  status: string;
  reason: string;
  matchup: string;
  since: string;
  games_missed: number;
  minutes: number | null;
  rotation: boolean;
};

type Change = {
  team: string;
  player_name: string;
  matchup: string;
  from: string | null;
  to: string | null;
  since_report_et: string;
};

type Returned = {
  team: string;
  player_name: string;
  listed_from: string;
  listed_to: string;
  returned_on: string;
  games_missed: number;
};

type Payload = {
  season: string;
  date: string;
  live: boolean;
  published_et: string | null;
  not_filed: string[];
  players: InjuredPlayer[];
  changes: Change[];
  recent_returns: Returned[];
  stored_days: string[];
};

const STATUS_VARIANT: Record<string, "error" | "warning" | "neutral" | "success"> = {
  Out: "error",
  Doubtful: "warning",
  Questionable: "warning",
  Probable: "neutral",
  Available: "success",
};

const todayEt = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

function formatPublishedTSI(publishedEt?: string | null): string {
  if (!publishedEt) return "";
  const m = publishedEt.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})\s+([AP]M)/i);
  if (!m) return publishedEt;
  const [, mon, day, yr, hh, mm, ap] = m;
  const fullYear = yr.length === 2 ? `20${yr}` : yr;
  let h = parseInt(hh, 10);
  if (ap.toUpperCase() === "PM" && h < 12) h += 12;
  if (ap.toUpperCase() === "AM" && h === 12) h = 0;
  try {
    const iso = `${fullYear}-${mon.padStart(2, "0")}-${day.padStart(2, "0")}T${String(h).padStart(2, "0")}:${mm}:00-04:00`;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return publishedEt;
    const fmt = new Intl.DateTimeFormat("tr-TR", {
      timeZone: "Europe/Istanbul",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return `${fmt.format(d)} TSİ`;
  } catch {
    return publishedEt;
  }
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <Badge variant="neutral" size="sm">Belirtilmedi</Badge>;
  return <Badge variant={STATUS_VARIANT[status] ?? "neutral"} size="sm">{status}</Badge>;
}

export default function InjuriesTab() {
  const [date, setDate] = useState<string>(todayEt());
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [rotationOnly, setRotationOnly] = useState(false);
  const [isDateMenuOpen, setIsDateMenuOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    loadPrivateApiFresh<Payload>(`/frontend-data-api/injuries?season=${CURRENT_SEASON}&date=${date}`)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [date]);

  useEffect(load, [load]);

  const days = useMemo(() => {
    const set = new Set([...(data?.stored_days ?? []), todayEt()]);
    return Array.from(set).sort();
  }, [data]);
  const dayIndex = days.indexOf(date);

  const players = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.players ?? []).filter((p) => {
      if (team && p.team !== team) return false;
      if (rotationOnly && !p.rotation) return false;
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (q && !p.player_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, team, query, statusFilter, rotationOnly]);

  const teams = useMemo(
    () => Array.from(new Set((data?.players ?? []).map((p) => p.team))).sort(),
    [data]
  );

  const playersByTeam = useMemo(() => {
    const map: Record<string, InjuredPlayer[]> = {};
    players.forEach((p) => {
      if (!map[p.team]) map[p.team] = [];
      map[p.team].push(p);
    });
    return map;
  }, [players]);

  if (error) {
    return <InlineError title="Sakatlık raporu yüklenemedi" message={error} onRetry={load} />;
  }

  const all = data?.players ?? [];
  const outCount = all.filter((p) => p.status === "Out").length;
  const questionableCount = all.filter(
    (p) => p.status === "Questionable" || p.status === "Doubtful"
  ).length;
  const rotationHit = all.filter(
    (p) => p.rotation && p.status !== "Probable" && p.status !== "Available"
  ).length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border-light pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Stethoscope size={18} className="text-primary" />
            <h1 className="text-xl font-semibold text-text-primary">Sakatlık Raporu</h1>
          </div>
          <p className="mt-1 text-xs text-text-secondary">
            Resmi NBA sakatlık bülteni · Model tahminlerine 15 dakikada bir senkronize edilir
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {data?.published_et && (
            <div className="flex items-center gap-1.5 rounded border border-border bg-background-primary px-3 py-1.5 text-xs text-text-secondary">
              <span className="h-2 w-2 rounded-full bg-status-success animate-pulse" />
              <span className="font-medium text-text-primary">
                Bülten: {formatPublishedTSI(data.published_et)}
              </span>
            </div>
          )}

          {/* Date Selector */}
          <div className="flex items-center gap-1">
            <Button
              variant="secondary"
              size="sm"
              aria-label="Önceki gün"
              disabled={dayIndex <= 0}
              onClick={() => setDate(days[dayIndex - 1])}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft size={15} strokeWidth={1.5} />
            </Button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setIsDateMenuOpen((open) => !open)}
                className="flex items-center gap-1.5 h-8 rounded border border-border bg-background-primary px-2.5 text-xs font-semibold text-text-primary hover:bg-background-tertiary transition-colors"
              >
                <Calendar size={13} strokeWidth={1.5} className="text-primary" />
                <span>{date ? fmtDate(date) : "Tarih Seç"}</span>
                <ChevronDown
                  className={`h-3 w-3 text-text-muted transition-transform ${
                    isDateMenuOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {isDateMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsDateMenuOpen(false)} />
                  <div className="absolute right-0 top-full z-50 mt-1 max-h-64 w-56 overflow-y-auto rounded border border-border bg-background-primary p-1 shadow-lg">
                    {[...days].reverse().map((d) => {
                      const isSelected = date === d;
                      const isToday = d === todayEt();
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => {
                            setDate(d);
                            setIsDateMenuOpen(false);
                          }}
                          className={`flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-xs transition-colors ${
                            isSelected
                              ? "bg-primary text-white font-semibold"
                              : "text-text-primary hover:bg-background-tertiary"
                          }`}
                        >
                          <span>{fmtDate(d)}</span>
                          {isToday && (
                            <span
                              className={`rounded px-1 text-[9px] font-semibold uppercase ${
                                isSelected ? "bg-white text-primary" : "bg-primary/10 text-primary"
                              }`}
                            >
                              Bugün
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <Button
              variant="secondary"
              size="sm"
              aria-label="Sonraki gün"
              disabled={dayIndex < 0 || dayIndex >= days.length - 1}
              onClick={() => setDate(days[dayIndex + 1])}
              className="h-8 w-8 p-0"
            >
              <ChevronRight size={15} strokeWidth={1.5} />
            </Button>
          </div>
        </div>
      </div>

      {loading || !data ? (
        <div className="space-y-4" aria-busy="true">
          <Skeleton height={42} />
          <Skeleton height={320} />
        </div>
      ) : (
        <>
          {/* Streamlined Stats Bar (No Separate Boxes) */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded border border-border bg-background-primary px-4 py-3">
            <div className="flex flex-wrap items-center gap-6 divide-x divide-border-light text-xs">
              <div className="flex items-baseline gap-1.5">
                <span className="text-base font-bold tabular-nums text-text-primary">{all.length}</span>
                <span className="text-text-secondary">Raporlanan İsim</span>
              </div>
              <div className="pl-6 flex items-baseline gap-1.5">
                <span className="text-base font-bold tabular-nums text-status-error">{outCount}</span>
                <span className="text-text-secondary">Kesin Eksik (OUT)</span>
              </div>
              <div className="pl-6 flex items-baseline gap-1.5">
                <span className="text-base font-bold tabular-nums text-status-warning">{questionableCount}</span>
                <span className="text-text-secondary">Belirsiz / Şüpheli</span>
              </div>
              <div className="pl-6 flex items-baseline gap-1.5">
                <span className="text-base font-bold tabular-nums text-primary">{rotationHit}</span>
                <span className="text-text-secondary">Rotasyon Oyuncusu</span>
              </div>
            </div>

            {/* Quick Status Filter Tabs */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  statusFilter === "all"
                    ? "bg-primary text-white"
                    : "text-text-secondary hover:bg-background-tertiary"
                }`}
              >
                Tümü
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("Out")}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  statusFilter === "Out"
                    ? "bg-status-error/15 text-status-error font-semibold"
                    : "text-text-secondary hover:bg-background-tertiary"
                }`}
              >
                Out ({outCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("Questionable")}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  statusFilter === "Questionable"
                    ? "bg-status-warning/15 text-status-warning font-semibold"
                    : "text-text-secondary hover:bg-background-tertiary"
                }`}
              >
                Questionable ({questionableCount})
              </button>
              <button
                type="button"
                onClick={() => setRotationOnly((v) => !v)}
                className={`flex items-center gap-1 rounded border px-2.5 py-1 text-xs font-medium transition-colors ${
                  rotationOnly
                    ? "border-primary bg-primary/10 text-primary font-semibold"
                    : "border-border text-text-secondary hover:bg-background-tertiary"
                }`}
              >
                <Filter size={12} />
                <span>Rotasyon</span>
              </button>
            </div>
          </div>

          {/* Not Submitted Alert Banner */}
          {data.not_filed.length > 0 && (
            <div className="rounded border border-border bg-background-primary p-3 text-xs">
              <span className="font-semibold text-text-primary">Henüz Rapor Bildirmeyen Takımlar: </span>
              <span className="text-text-secondary">{data.not_filed.join(", ")}</span>
            </div>
          )}

          {/* Search & Team Filter Toolbar */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search
                size={14}
                strokeWidth={1.5}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
              />
              <input
                type="text"
                placeholder="Oyuncu adına göre filtrele..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full h-8.5 rounded border border-border bg-background-primary pl-9 pr-8 text-xs text-text-primary placeholder:text-text-muted focus:border-border-focus outline-none transition-colors"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            <div className="relative">
              <select
                aria-label="Takım Filtresi"
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                className="h-8.5 appearance-none rounded border border-border bg-background-primary pl-3 pr-8 text-xs font-medium text-text-primary focus:border-border-focus outline-none transition-colors cursor-pointer"
              >
                <option value="">Tüm Takımlar ({teams.length})</option>
                {teams.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={13}
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted"
              />
            </div>
          </div>

          {/* Status Transitions / Changes Alert Strip (Son rapordan bu yana yaşanan değişiklikler) */}
          {data.changes && data.changes.length > 0 && (
            <div className="rounded border border-status-warning/30 bg-status-warning/[0.04] p-4">
              <div className="flex items-center justify-between mb-3 border-b border-status-warning/20 pb-2">
                <div className="flex items-center gap-2">
                  <Flame size={15} className="text-status-warning" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-status-warning">
                    Son Rapordan Bu Yana Durumu Değişenler
                  </h3>
                </div>
                <span className="text-xs font-medium tabular-nums text-text-muted">
                  {data.changes.length} Oyuncu Güncellendi
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {data.changes.map((c, i) => (
                  <div
                    key={`${c.team}-${c.player_name}-${i}`}
                    className="flex items-center justify-between gap-2.5 rounded border border-border bg-background-primary p-2.5 shadow-none"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <TeamLogo abbr={c.team} size={24} />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-text-primary">
                          {c.player_name}
                        </p>
                        <p className="text-[10px] text-text-muted">
                          {c.team} · {c.matchup}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 tabular-nums">
                      <span className="rounded bg-background-tertiary px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
                        {c.from}
                      </span>
                      <ArrowRightLeft size={11} className="text-text-muted" />
                      <StatusBadge status={c.to} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Team Grouped Cards */}
          {all.length === 0 ? (
            <EmptyState
              icon={<Stethoscope size={32} strokeWidth={1.5} />}
              title={data.live ? "Bugün için henüz rapor yayınlanmadı" : "Bu tarih için kayıt bulunamadı"}
              description={
                data.live
                  ? "Takımlar maçtan önceki gün ilk listelerini verir ve maç saatine kadar günceller."
                  : "Seçilen tarihte bildirilmiş herhangi bir sakatlık kaydı mevcut değil."
              }
            />
          ) : players.length === 0 ? (
            <EmptyState
              title="Aramaya uygun oyuncu bulunamadı"
              description="Belirlediğiniz filtre kriterlerine uyan sakatlık kaydı bulunmuyor."
              actionLabel="Filtreleri Temizle"
              onAction={() => {
                setQuery("");
                setTeam("");
                setStatusFilter("all");
                setRotationOnly(false);
              }}
            />
          ) : (
            <div className="space-y-4">
              {Object.entries(playersByTeam).map(([teamAbbr, teamPlayers]) => {
                const teamOut = teamPlayers.filter((p) => p.status === "Out").length;
                const teamQues = teamPlayers.filter((p) => p.status === "Questionable" || p.status === "Doubtful").length;
                const matchup = teamPlayers[0]?.matchup || "";

                return (
                  <div key={teamAbbr} className="rounded border border-border bg-background-primary overflow-hidden">
                    {/* Team Header Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-light bg-background-tertiary/50 px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <TeamLogo abbr={teamAbbr} size={26} />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-text-primary">{teamAbbr}</span>
                            {matchup && (
                              <span className="text-xs font-mono text-text-muted">({matchup})</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        {teamOut > 0 && (
                          <span className="rounded bg-status-error/10 text-status-error px-2 py-0.5 font-semibold">
                            {teamOut} OUT
                          </span>
                        )}
                        {teamQues > 0 && (
                          <span className="rounded bg-status-warning/10 text-status-warning px-2 py-0.5 font-semibold">
                            {teamQues} Şüpheli
                          </span>
                        )}
                        <span className="text-text-muted tabular-nums">
                          {teamPlayers.length} Oyuncu Bildirildi
                        </span>
                      </div>
                    </div>

                    {/* Players Table in Team Card */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="text-text-muted border-b border-border-light">
                          <tr>
                            <th className="px-4 py-2.5 font-semibold uppercase tracking-wider">Oyuncu</th>
                            <th className="px-4 py-2.5 font-semibold uppercase tracking-wider">Durum</th>
                            <th className="px-4 py-2.5 font-semibold uppercase tracking-wider">Sakatlık Gerekçesi (Reason)</th>
                            <th className="px-4 py-2.5 text-right font-semibold uppercase tracking-wider">Kaçırılan Maç</th>
                            <th className="px-4 py-2.5 text-right font-semibold uppercase tracking-wider">Ortalama Dk</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-light">
                          {teamPlayers.map((p) => (
                            <tr
                              key={`${p.team}-${p.player_name}`}
                              className="hover:bg-background-tertiary/30 transition-colors"
                            >
                              <td className="px-4 py-2.5 whitespace-nowrap">
                                <div className="flex items-center gap-2.5">
                                  {p.player_id ? (
                                    <PlayerPhoto playerId={p.player_id} name={p.player_name} size={32} className="ring-1 ring-border" />
                                  ) : (
                                    <div className="w-8 h-8 rounded-full bg-background-tertiary flex items-center justify-center font-bold text-[10px] text-text-muted">
                                      {p.player_name.slice(0, 2)}
                                    </div>
                                  )}
                                  <div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-semibold text-text-primary text-xs">{p.player_name}</span>
                                      {p.rotation && (
                                        <span className="rounded bg-status-info/10 text-status-info px-1 py-0.2 font-semibold text-[10px]">
                                          Rotasyon
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[11px] text-text-muted font-mono">{p.since} tarihinden beri</span>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-2.5 whitespace-nowrap">
                                <StatusBadge status={p.status} />
                              </td>
                              <td className="px-4 py-2.5 text-text-secondary max-w-md text-xs leading-relaxed">
                                {p.reason}
                              </td>
                              <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary font-medium">
                                {p.games_missed > 0 ? `${p.games_missed} maç` : "—"}
                              </td>
                              <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary font-medium">
                                {p.minutes ? `${p.minutes.toFixed(1)} dk` : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Recent Returns Table */}
          {data.recent_returns.length > 0 && (
            <Card padding="none" className="overflow-x-auto">
              <div className="border-b border-border px-4 py-3">
                <h3 className="text-sm font-semibold text-text-primary">
                  Son 7 Günde Sahalara Dönenler
                </h3>
                <p className="text-xs text-text-secondary">
                  Sakatlık listesinden çıkarılarak tekrar aktif olan oyuncular
                </p>
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-background-tertiary text-text-muted">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold uppercase tracking-wider">Oyuncu</th>
                    <th className="px-4 py-2.5 font-semibold uppercase tracking-wider">Dönüş Tarihi</th>
                    <th className="px-4 py-2.5 font-semibold uppercase tracking-wider">Sakatlık Dönemi</th>
                    <th className="px-4 py-2.5 text-right font-semibold uppercase tracking-wider">Kaçırılan Maç</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.recent_returns.map((r) => (
                    <tr
                      key={`${r.team}-${r.player_name}`}
                      className="hover:bg-background-tertiary/40 transition-colors"
                    >
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="inline-flex items-center gap-2">
                          <TeamLogo abbr={r.team} size={20} />
                          <span className="font-semibold text-text-primary">{r.player_name}</span>
                        </span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap font-medium text-status-success">
                        {r.returned_on}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-text-secondary">
                        {r.listed_from} – {r.listed_to}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary font-medium">
                        {r.games_missed} maç
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
