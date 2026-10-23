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

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card padding="md" className="flex flex-col justify-between">
      <div>
        <p className="text-xs font-medium text-text-secondary">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-text-primary">{value}</p>
      </div>
      {hint && <p className="mt-1 text-xs text-text-muted">{hint}</p>}
    </Card>
  );
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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Sakatlık Raporu (Injuries)</h1>
          <p className="mt-1 text-xs text-text-secondary">
            Resmi NBA sakatlık bülteni. Güncel raporlar 15 dakikada bir otomatik çekilir ve model tahminlerine anında uygulanır.
          </p>
        </div>

        {data?.published_et && (
          <div className="flex items-center gap-1.5 self-start rounded border border-border bg-background-primary px-3 py-1.5 text-xs text-text-secondary">
            <span className="h-2 w-2 rounded-full bg-status-success" />
            <span className="font-medium text-text-primary">
              Rapor Saati: {formatPublishedTSI(data.published_et)}
            </span>
          </div>
        )}
      </div>

      {/* Date Navigation & Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          aria-label="Önceki gün"
          disabled={dayIndex <= 0}
          onClick={() => setDate(days[dayIndex - 1])}
        >
          <ChevronLeft size={16} strokeWidth={1.5} />
        </Button>

        {/* Date Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsDateMenuOpen((open) => !open)}
            className="flex items-center gap-2 rounded border border-border bg-background-primary px-3 py-1.5 text-xs font-semibold text-text-primary hover:border-border-hover hover:bg-background-tertiary transition-colors"
          >
            <Calendar size={14} strokeWidth={1.5} className="text-primary" />
            <span>{date ? fmtDate(date) : "Tarih Seç"}</span>
            <span className="text-[10px] text-text-muted font-mono">({date})</span>
            <ChevronDown
              className={`h-3.5 w-3.5 text-text-muted transition-transform ${
                isDateMenuOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {isDateMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsDateMenuOpen(false)} />
              <div className="absolute left-0 top-full z-50 mt-1 max-h-64 w-60 overflow-y-auto rounded border border-border bg-background-primary p-1.5 shadow-xl">
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
                      className={`flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-xs transition-all ${
                        isSelected
                          ? "bg-primary text-white font-semibold"
                          : "text-text-primary hover:bg-background-tertiary"
                      }`}
                    >
                      <div className="flex flex-col">
                        <span>{fmtDate(d)}</span>
                        <span
                          className={`text-[10px] font-mono ${
                            isSelected ? "text-white/80" : "text-text-muted"
                          }`}
                        >
                          {d}
                        </span>
                      </div>
                      {isToday && (
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
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
        >
          <ChevronRight size={16} strokeWidth={1.5} />
        </Button>
      </div>

      {loading || !data ? (
        <div className="space-y-4" aria-busy="true">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={84} />
            ))}
          </div>
          <Skeleton height={320} />
        </div>
      ) : (
        <>
          {/* Key Metric KPI Cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label="Raporlanan Oyuncular"
              value={`${all.length}`}
              hint="Toplam bildirilen isim"
            />
            <Stat
              label="Kesin Oynamayacak (OUT)"
              value={`${outCount}`}
              hint="Doğrulanmış eksikler"
            />
            <Stat
              label="Belirsiz (Questionable)"
              value={`${questionableCount}`}
              hint="Maç saatinde netleşecek"
            />
            <Stat
              label="Ana Rotasyon Oyuncusu"
              value={`${rotationHit}`}
              hint="Son 10 maçta 15+ dk alanlar"
            />
          </div>

          {/* Not Submitted Alert Banner */}
          {data.not_filed.length > 0 && (
            <div className="rounded border border-border bg-background-primary p-3.5 text-xs">
              <span className="font-semibold text-text-primary">Henüz Rapor Bildirmeyen Takımlar: </span>
              <span className="text-text-secondary">{data.not_filed.join(", ")}</span>
              <p className="mt-1 text-[11px] text-text-muted">
                Model bu takımlar için önceki maçtaki kadro durumunu varsayılan olarak kabul eder.
              </p>
            </div>
          )}

          {/* Search & Filter Toolbar */}
          <Card padding="md" className="space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Search input */}
              <div className="relative flex-1 min-w-[200px] max-w-sm">
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
                  className="w-full h-9 rounded border border-border bg-background-primary pl-9 pr-8 text-xs font-medium text-text-primary placeholder:text-text-muted focus:border-border-focus focus:ring-1 focus:ring-border-focus outline-none transition-colors"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                    aria-label="Filtreyi temizle"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Team Filter */}
              <select
                aria-label="Takım Filtresi"
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                className="h-9 rounded border border-border bg-background-primary px-3 text-xs font-medium text-text-primary focus:border-border-focus focus:ring-1 focus:ring-border-focus outline-none transition-colors"
              >
                <option value="">Tüm Takımlar ({teams.length})</option>
                {teams.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>

              {/* Status Filter */}
              <select
                aria-label="Durum Filtresi"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 rounded border border-border bg-background-primary px-3 text-xs font-medium text-text-primary focus:border-border-focus focus:ring-1 focus:ring-border-focus outline-none transition-colors"
              >
                <option value="all">Tüm Durumlar</option>
                <option value="Out">Sadece Out</option>
                <option value="Questionable">Sadece Questionable</option>
                <option value="Doubtful">Sadece Doubtful</option>
                <option value="Probable">Sadece Probable</option>
              </select>

              {/* Rotation Only Toggle */}
              <Button
                variant={rotationOnly ? "primary" : "secondary"}
                size="sm"
                aria-pressed={rotationOnly}
                onClick={() => setRotationOnly((v) => !v)}
              >
                <Filter size={13} strokeWidth={1.5} />
                <span>Rotasyon Oyuncuları</span>
              </Button>
            </div>
          </Card>

          {/* Main Table */}
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
            <Card padding="none" className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-background-tertiary text-text-muted">
                  <tr>
                    <th className="px-4 py-3 font-semibold uppercase tracking-wider">Oyuncu</th>
                    <th className="px-4 py-3 font-semibold uppercase tracking-wider">Durum</th>
                    <th className="px-4 py-3 font-semibold uppercase tracking-wider">Karşılaşma</th>
                    <th className="px-4 py-3 font-semibold uppercase tracking-wider">Sakatlık Gerekçesi (Reason)</th>
                    <th className="px-4 py-3 text-right font-semibold uppercase tracking-wider">Kaçırılan Maç</th>
                    <th className="px-4 py-3 text-right font-semibold uppercase tracking-wider">Ortalama Dk</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {players.map((p) => (
                    <tr
                      key={`${p.team}-${p.player_name}`}
                      className="hover:bg-background-tertiary/40 transition-colors"
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          {p.player_id ? (
                            <PlayerPhoto playerId={p.player_id} name={p.player_name} size={30} />
                          ) : (
                            <TeamLogo abbr={p.team} size={24} />
                          )}
                          <div className="flex flex-col">
                            <span className="font-semibold text-text-primary">{p.player_name}</span>
                            <span className="text-[10px] text-text-muted font-medium flex items-center gap-1">
                              {p.team}
                              {p.rotation && (
                                <span className="rounded-sm bg-status-info/10 text-status-info px-1 py-0.2 font-semibold">
                                  Rotasyon
                                </span>
                              )}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-text-secondary">
                        {p.matchup}
                      </td>
                      <td className="px-4 py-3 text-text-secondary max-w-md">
                        {p.reason}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-text-secondary font-medium">
                        {p.games_missed > 0 ? `${p.games_missed} maç` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-text-secondary font-medium">
                        {p.minutes ? `${p.minutes.toFixed(1)} dk` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
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
