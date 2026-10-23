import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Flame, Search, Stethoscope } from "lucide-react";
import { Badge, Button, Card, DatePicker, EmptyState, InlineError, Input, Select, Skeleton } from "./common";
import TeamLogo from "./TeamLogo";
import PlayerPhoto from "./PlayerPhoto";
import { loadPrivateApiFresh } from "../lib/dataCache";
import { CURRENT_SEASON } from "../lib/constants";
import { fmtDate } from "./game-results/utils";
import { reportStampText } from "../lib/injuryTime";

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

type StatusFilter = "all" | "out" | "uncertain";

const STATUS_VARIANT: Record<string, "error" | "warning" | "neutral" | "success"> = {
  Out: "error",
  Doubtful: "warning",
  Questionable: "warning",
  Probable: "neutral",
  Available: "success",
};

const isUncertain = (status: string) => status === "Questionable" || status === "Doubtful";

const todayEt = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <Badge variant="neutral" size="sm">Belirtilmedi</Badge>;
  return <Badge variant={STATUS_VARIANT[status] ?? "neutral"} size="sm">{status}</Badge>;
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone?: "error" | "warning" | "info" }) {
  const color = tone === "error" ? "text-status-error" : tone === "warning" ? "text-status-warning" : tone === "info" ? "text-status-info" : "text-text-primary";
  return (
    <div className="rounded border border-border bg-background-primary p-4">
      <dt className="text-xs text-text-secondary">{label}</dt>
      <dd className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</dd>
    </div>
  );
}

function InjuriesSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Sakatlık raporu yükleniyor">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded" />
        ))}
      </div>
      <Skeleton className="h-14 w-full rounded" />
      <Skeleton className="h-80 w-full rounded" />
    </div>
  );
}

export default function InjuriesTab() {
  const [date, setDate] = useState<string>(todayEt());
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: Payload; error?: string } | null>(null);
  const [team, setTeam] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [rotationOnly, setRotationOnly] = useState(false);

  const requestKey = `${date}|${reloadKey}`;

  useEffect(() => {
    let cancelled = false;
    loadPrivateApiFresh<Payload>(`/frontend-data-api/injuries?season=${CURRENT_SEASON}&date=${date}`)
      .then((data) => {
        if (!cancelled) setResult({ key: requestKey, data });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setResult({
            key: requestKey,
            error: e instanceof Error && e.message ? e.message : "Sakatlık raporu alınamadı.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [date, requestKey]);

  const loading = result?.key !== requestKey;
  const data = result?.key === requestKey ? result.data : undefined;
  const error = result?.key === requestKey ? result.error : undefined;

  const days = useMemo(
    () => Array.from(new Set([...(result?.data?.stored_days ?? []), todayEt(), date])).sort(),
    [result, date]
  );

  const all = useMemo(() => data?.players ?? [], [data]);
  const outCount = all.filter((p) => p.status === "Out").length;
  const uncertainCount = all.filter((p) => isUncertain(p.status)).length;
  const rotationCount = all.filter((p) => p.rotation && p.status !== "Probable" && p.status !== "Available").length;

  const players = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((p) => {
      if (team && p.team !== team) return false;
      if (rotationOnly && !p.rotation) return false;
      if (statusFilter === "out" && p.status !== "Out") return false;
      if (statusFilter === "uncertain" && !isUncertain(p.status)) return false;
      if (q && !p.player_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [all, team, query, statusFilter, rotationOnly]);

  const teams = useMemo(() => Array.from(new Set(all.map((p) => p.team))).sort(), [all]);

  const playersByTeam = useMemo(() => {
    const map: Record<string, InjuredPlayer[]> = {};
    players.forEach((p) => {
      (map[p.team] ??= []).push(p);
    });
    return map;
  }, [players]);

  const resetFilters = () => {
    setQuery("");
    setTeam("");
    setStatusFilter("all");
    setRotationOnly(false);
  };

  const filters: { id: StatusFilter; label: string; count?: number }[] = [
    { id: "all", label: "Tümü", count: all.length },
    { id: "out", label: "Out", count: outCount },
    { id: "uncertain", label: "Questionable / Doubtful", count: uncertainCount },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-border-light pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Sakatlık raporu</h1>
          <p className="mt-1 text-xs text-text-secondary">
            Resmi NBA sakatlık bülteni. Model tahminlerine 15 dakikada bir senkronize edilir.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          {data?.published_et && (
            <Badge variant="success" dot>
              Bülten: {reportStampText(data.published_et)}
            </Badge>
          )}
          <DatePicker
            dates={days}
            value={date}
            onChange={setDate}
            todayStr={todayEt()}
            formatDate={fmtDate}
          />
        </div>
      </div>

      {loading ? (
        <InjuriesSkeleton />
      ) : error || !data ? (
        <InlineError
          title="Sakatlık raporu yüklenemedi"
          message={error ?? "Rapor verisi alınamadı."}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryTile label="Raporlanan oyuncu" value={all.length} />
            <SummaryTile label="Kesin yok (Out)" value={outCount} tone="error" />
            <SummaryTile label="Belirsiz / şüpheli" value={uncertainCount} tone="warning" />
            <SummaryTile label="Etkilenen rotasyon oyuncusu" value={rotationCount} tone="info" />
          </dl>

          {data.not_filed.length > 0 && (
            <Card padding="sm" className="text-xs">
              <span className="font-semibold text-text-primary">Henüz rapor bildirmeyen takımlar: </span>
              <span className="text-text-secondary">{data.not_filed.join(", ")}</span>
            </Card>
          )}

          {data.changes.length > 0 && (
            <section aria-labelledby="injury-changes" className="rounded border border-status-warning/30 bg-status-warning/5 p-4">
              <div className="mb-3 flex items-center justify-between gap-2 border-b border-status-warning/20 pb-2">
                <h2 id="injury-changes" className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                  <Flame size={16} strokeWidth={1.5} className="text-status-warning" aria-hidden="true" />
                  Son rapordan bu yana durumu değişenler
                </h2>
                <span className="text-xs tabular-nums text-text-secondary">{data.changes.length} oyuncu</span>
              </div>
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {data.changes.map((c, i) => (
                  <li
                    key={`${c.team}-${c.player_name}-${i}`}
                    className="flex items-center justify-between gap-3 rounded border border-border bg-background-primary p-3"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <TeamLogo abbr={c.team} name="" size={24} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-text-primary">{c.player_name}</p>
                        <p className="truncate text-xs text-text-secondary">
                          {c.team} · {c.matchup}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Badge variant="neutral" size="sm">{c.from ?? "Belirtilmedi"}</Badge>
                      <ArrowRight size={16} strokeWidth={1.5} className="text-text-muted" aria-label="değişti" />
                      <StatusBadge status={c.to} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Card padding="sm" className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="w-full lg:flex-1">
              <Input
                label="Oyuncu ara"
                type="text"
                autoComplete="off"
                placeholder="Oyuncu adı"
                leftIcon={<Search size={16} strokeWidth={1.5} />}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="w-full lg:w-52">
              <Select label="Takım" value={team} onChange={(e) => setTeam(e.target.value)} className="h-10">
                <option value="">Tüm takımlar ({teams.length})</option>
                {teams.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Durum filtresi">
              {filters.map((f) => (
                <Button
                  key={f.id}
                  size="sm"
                  variant={statusFilter === f.id ? "primary" : "secondary"}
                  aria-pressed={statusFilter === f.id}
                  onClick={() => setStatusFilter(f.id)}
                >
                  {f.label} <span className="tabular-nums">({f.count})</span>
                </Button>
              ))}
              <Button
                size="sm"
                variant={rotationOnly ? "primary" : "secondary"}
                aria-pressed={rotationOnly}
                onClick={() => setRotationOnly((v) => !v)}
              >
                Sadece rotasyon
              </Button>
            </div>
          </Card>

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
              title="Filtreye uyan oyuncu bulunamadı"
              description="Seçtiğin kriterlere uyan sakatlık kaydı yok."
              actionLabel="Filtreleri temizle"
              onAction={resetFilters}
            />
          ) : (
            <div className="space-y-4">
              {Object.entries(playersByTeam).map(([teamAbbr, teamPlayers]) => {
                const teamOut = teamPlayers.filter((p) => p.status === "Out").length;
                const teamUncertain = teamPlayers.filter((p) => isUncertain(p.status)).length;
                const matchup = teamPlayers[0]?.matchup || "";

                return (
                  <Card key={teamAbbr} padding="none" className="overflow-hidden" aria-label={`${teamAbbr} sakatlık listesi`}>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-light bg-background-tertiary px-4 py-3">
                      <div className="flex items-center gap-3">
                        <TeamLogo abbr={teamAbbr} name="" size={28} />
                        <h2 className="text-sm font-semibold text-text-primary">{teamAbbr}</h2>
                        {matchup && <span className="text-xs tabular-nums text-text-secondary">{matchup}</span>}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {teamOut > 0 && (
                          <Badge variant="error" size="sm">
                            <span className="tabular-nums">{teamOut}</span> Out
                          </Badge>
                        )}
                        {teamUncertain > 0 && (
                          <Badge variant="warning" size="sm">
                            <span className="tabular-nums">{teamUncertain}</span> belirsiz
                          </Badge>
                        )}
                        <span className="text-xs tabular-nums text-text-secondary">
                          {teamPlayers.length} oyuncu
                        </span>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <caption className="sr-only">{teamAbbr} için raporlanan sakat oyuncular</caption>
                        <thead className="border-b border-border-light text-xs text-text-secondary">
                          <tr>
                            <th scope="col" className="px-4 py-2 font-medium">Oyuncu</th>
                            <th scope="col" className="px-4 py-2 font-medium">Durum</th>
                            <th scope="col" className="px-4 py-2 font-medium">Gerekçe</th>
                            <th scope="col" className="px-4 py-2 text-right font-medium">Kaçırılan maç</th>
                            <th scope="col" className="px-4 py-2 text-right font-medium">Ortalama dakika</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-light">
                          {teamPlayers.map((p) => (
                            <tr key={`${p.team}-${p.player_name}`} className="hover:bg-background-secondary">
                              <td className="whitespace-nowrap px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <PlayerPhoto playerId={p.player_id ?? 0} name={p.player_name} size={32} className="shrink-0" />
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-semibold text-text-primary">{p.player_name}</span>
                                      {p.rotation && <Badge variant="info" size="sm">Rotasyon</Badge>}
                                    </div>
                                    <span className="text-xs tabular-nums text-text-muted">{p.since} tarihinden beri</span>
                                  </div>
                                </div>
                              </td>
                              <td className="whitespace-nowrap px-4 py-3">
                                <StatusBadge status={p.status} />
                              </td>
                              <td className="max-w-md px-4 py-3 text-xs leading-relaxed text-text-secondary">
                                {p.reason || "—"}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums text-text-secondary">
                                {p.games_missed > 0 ? `${p.games_missed} maç` : "—"}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums text-text-secondary">
                                {p.minutes ? `${p.minutes.toFixed(1)} dk` : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {data.recent_returns.length > 0 && (
            <Card padding="none" className="overflow-hidden">
              <div className="border-b border-border-light px-4 py-3">
                <h2 className="text-sm font-semibold text-text-primary">Son 7 günde sahalara dönenler</h2>
                <p className="text-xs text-text-secondary">Sakatlık listesinden çıkarılarak tekrar aktif olan oyuncular</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-background-tertiary text-xs text-text-secondary">
                    <tr>
                      <th scope="col" className="px-4 py-2 font-medium">Oyuncu</th>
                      <th scope="col" className="px-4 py-2 font-medium">Dönüş tarihi</th>
                      <th scope="col" className="px-4 py-2 font-medium">Sakatlık dönemi</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">Kaçırılan maç</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-light">
                    {data.recent_returns.map((r) => (
                      <tr key={`${r.team}-${r.player_name}`} className="hover:bg-background-secondary">
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className="inline-flex items-center gap-2">
                            <TeamLogo abbr={r.team} name="" size={20} />
                            <span className="font-semibold text-text-primary">{r.player_name}</span>
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums text-status-success">{r.returned_on}</td>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums text-text-secondary">
                          {r.listed_from} – {r.listed_to}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-text-secondary">{r.games_missed} maç</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
