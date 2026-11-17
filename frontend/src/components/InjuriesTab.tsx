import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Flame, Search, Stethoscope } from "lucide-react";
import { Badge, Card, DatePicker, EmptyState, InlineError, Input, Select, Skeleton } from "./common";
import TeamLogo from "./TeamLogo";
import PlayerPhoto from "./PlayerPhoto";
import { loadPrivateApi, loadPrivateApiFresh } from "../lib/dataCache";
import { CURRENT_SEASON } from "../lib/constants";
import { reportStampText } from "../lib/injuryTime";
import { TEAM_NAME_BY_ABBR, isKnownTeamAbbr } from "../lib/nbaTeams";
import { updateUrlRoute } from "../lib/router";
import { useLanguage } from "../context/useLanguage";

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
  matchup?: string;
  from?: string | null;
  to?: string | null;
  since_report_et?: string;
  steps?: { status: string | null; at: string }[];
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

const normName = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();

const etDateOffset = (offsetDays = 0) => {
  const dt = new Date(Date.now() + offsetDays * 86_400_000);
  return dt.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
};

function StatusBadge({ status }: { status: string | null }) {
  const { t } = useLanguage();
  if (!status) return <Badge variant="neutral" size="sm">{t.injuries.notSpecified}</Badge>;
  return <Badge variant={STATUS_VARIANT[status] ?? "neutral"} size="sm">{status}</Badge>;
}

function InjuriesSkeleton() {
  const { t } = useLanguage();
  return (
    <div className="space-y-4" aria-busy="true" aria-label={t.injuries.loadingReport}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={76} />
        ))}
      </div>
      <Skeleton className="h-9 w-full rounded" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} padding="none" className="divide-y divide-border-light overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5">
              <Skeleton className="h-5 w-36 rounded" />
              <Skeleton className="h-4 w-16 rounded" />
            </div>
            {[0, 1, 2].map((r) => (
              <div key={r} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="flex items-center gap-2.5">
                  <Skeleton variant="circular" width={28} height={28} />
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-28 rounded" />
                    <Skeleton className="h-3 w-40 rounded" />
                  </div>
                </div>
                <Skeleton className="h-5 w-16 rounded-sm" />
              </div>
            ))}
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function InjuriesTab() {
  const { t, language, formatDate } = useLanguage();
  const tr = language === "tr";
  const todayStr = etDateOffset(0);
  const tomorrowStr = etDateOffset(1);

  const [date, setDate] = useState<string>(todayStr);
  const [storedDays, setStoredDays] = useState<string[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [showAllChanges, setShowAllChanges] = useState(false);
  const [result, setResult] = useState<{ key: string; data?: Payload; error?: string } | null>(null);
  const [team, setTeam] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [rotationOnly, setRotationOnly] = useState(false);

  const requestKey = `${date}|${reloadKey}`;

  // The report only carries ids for some rows; profiles let every row open the player profile.
  const [idByName, setIdByName] = useState<Record<string, number>>({});
  useEffect(() => {
    loadPrivateApi<Array<{ PLAYER_ID: number; PLAYER_NAME: string }>>("/frontend-data-api/player-profiles")
      .then((profiles) => {
        const map: Record<string, number> = {};
        (profiles ?? []).forEach((p) => {
          map[normName(p.PLAYER_NAME)] = p.PLAYER_ID;
        });
        setIdByName(map);
      })
      .catch(() => { });
  }, []);
  const idFor = (name: string, id?: number | null) => id || idByName[normName(name)] || 0;
  const openPlayer = (playerId: number) => {
    if (playerId > 0) updateUrlRoute({ tab: "player-profile", playerId });
  };

  useEffect(() => {
    let cancelled = false;
    loadPrivateApiFresh<Payload>(`/frontend-data-api/injuries?season=${CURRENT_SEASON}&date=${date}`)
      .then((data) => {
        if (cancelled) return;
        setResult({ key: requestKey, data });
        if (Array.isArray(data.stored_days) && data.stored_days.length > 0) {
          setStoredDays((prev) => Array.from(new Set([...prev, ...data.stored_days])).sort());
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setResult({
            key: requestKey,
            error: e instanceof Error && e.message ? e.message : t.injuries.loadError,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [date, requestKey, t.injuries.loadError]);

  const loading = result?.key !== requestKey;
  const data = result?.key === requestKey ? result.data : undefined;
  const error = result?.key === requestKey ? result.error : undefined;

  const days = useMemo(
    () => Array.from(new Set([...storedDays, todayStr, tomorrowStr, date])).sort(),
    [storedDays, todayStr, tomorrowStr, date]
  );

  const realChanges = useMemo(() => {
    if (!data?.changes) return [];
    return data.changes.filter((c) => {
      const fromSt = c.from ?? (c.steps?.[0]?.status ?? "Available");
      const toSt = c.to ?? (c.steps?.[c.steps.length - 1]?.status ?? "Available");
      return fromSt !== toSt;
    });
  }, [data]);

  const all = useMemo(() => data?.players ?? [], [data]);
  const outCount = useMemo(() => all.filter((p) => p.status === "Out").length, [all]);
  const uncertainCount = useMemo(() => all.filter((p) => isUncertain(p.status)).length, [all]);
  const rotationCount = useMemo(() => all.filter((p) => p.rotation).length, [all]);

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

  const filters: { id: StatusFilter; label: string; count: number }[] = [
    { id: "all", label: t.common.all, count: all.length },
    { id: "out", label: "Out", count: outCount },
    { id: "uncertain", label: tr ? "Belirsiz" : "Uncertain", count: uncertainCount },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1
            className="text-lg font-semibold text-text-primary sm:text-xl"
            title={tr ? "Resmi NBA sakatlık bülteni, 15 dakikada bir senkronize edilir" : "Official NBA injury report, synchronized every 15 minutes"}
          >
            {tr ? "Sakatlık raporu" : "Injury report"}
          </h1>
          <p className="mt-0.5 text-xs text-text-secondary">
            {tr ? "Resmi NBA oyuncu durumu ve maç öncesi değişiklikler" : "Official NBA player availability & status updates"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {data?.published_et && (
            <Badge variant={data.live ? "success" : "neutral"} dot={data.live}>
              {tr ? "Bülten: " : "Report: "}{reportStampText(data.published_et, language)}
            </Badge>
          )}
          <DatePicker
            dates={days}
            value={date}
            onChange={setDate}
            todayStr={todayStr}
            formatDate={formatDate}
          />
        </div>
      </div>

      {loading ? (
        <InjuriesSkeleton />
      ) : error || !data ? (
        <InlineError
          title={t.injuries.loadError}
          message={error ?? t.injuries.loadError}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      ) : (
        <>
          {/* Compact KPI Strip */}
          {all.length > 0 && (
            <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Card padding="sm" className="flex flex-col justify-between">
                <dt className="text-xs font-medium text-text-secondary">{tr ? "Toplam Kayıt" : "Total Listed"}</dt>
                <dd className="mt-1 text-xl font-semibold tabular-nums text-text-primary">{all.length}</dd>
                <p className="mt-1 text-xs tabular-nums text-text-muted">
                  {teams.length} {tr ? "takım" : "teams"}
                </p>
              </Card>
              <Card padding="sm" className="flex flex-col justify-between">
                <dt className="text-xs font-medium text-text-secondary">{tr ? "Kadro Dışı (Out)" : "Out"}</dt>
                <dd className="mt-1 text-xl font-semibold tabular-nums text-status-error">{outCount}</dd>
                <p className="mt-1 text-xs text-text-muted">{tr ? "Maçta yok" : "Ruled out"}</p>
              </Card>
              <Card padding="sm" className="flex flex-col justify-between">
                <dt className="text-xs font-medium text-text-secondary">{tr ? "Belirsiz (Q / D)" : "Uncertain (Q / D)"}</dt>
                <dd className="mt-1 text-xl font-semibold tabular-nums text-status-warning">{uncertainCount}</dd>
                <p className="mt-1 text-xs text-text-muted">Questionable · Doubtful</p>
              </Card>
              <Card padding="sm" className="flex flex-col justify-between">
                <dt className="text-xs font-medium text-text-secondary">{tr ? "Rotasyon Oyuncusu" : "Rotation Players"}</dt>
                <dd className="mt-1 text-xl font-semibold tabular-nums text-text-primary">{rotationCount}</dd>
                <p className="mt-1 text-xs text-text-muted">{tr ? "Düzenli dakika alanlar" : "Core rotation minutes"}</p>
              </Card>
            </dl>
          )}

          {data.not_filed.length > 0 && (
            <p className="text-xs text-text-secondary">
              <span className="font-medium text-text-primary">
                {tr ? "Rapor bildirmeyen takımlar: " : "Teams yet to file: "}
              </span>
              {data.not_filed.join(", ")}
            </p>
          )}

          {realChanges.length > 0 && (
            <section aria-labelledby="injury-changes" className="rounded border border-status-warning/30 bg-status-warning/5 p-3">
              <h2 id="injury-changes" className="mb-2 flex items-center gap-2 text-sm font-semibold text-text-primary">
                <Flame size={16} strokeWidth={1.5} className="text-status-warning" aria-hidden="true" />
                {t.injuries.changesTitle}
                <span className="text-xs font-normal tabular-nums text-text-secondary">({realChanges.length})</span>
              </h2>
              <ul className="grid grid-cols-1 gap-2 xl:grid-cols-2 2xl:grid-cols-3">
                {realChanges.map((c, i) => {
                  const pid = idFor(c.player_name);
                  return (
                    <li
                      key={`${c.team}-${c.player_name}-${i}`}
                      className={`${!showAllChanges && i >= 4 ? "hidden md:flex" : "flex"} items-center justify-between gap-2 rounded border border-border bg-background-primary px-2.5 py-2`}
                    >
                      <button
                        type="button"
                        disabled={!pid}
                        onClick={() => openPlayer(pid)}
                        className="group flex min-w-0 cursor-pointer items-center gap-2 text-left disabled:cursor-default"
                      >
                        <PlayerPhoto playerId={pid} name={c.player_name} size={26} className="shrink-0" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-text-primary group-hover:underline">
                            {c.player_name}
                          </p>
                          <p className="truncate text-xs text-text-secondary">{c.team}{c.matchup ? ` · ${c.matchup}` : ""}</p>
                        </div>
                      </button>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Badge
                          variant={c.from ? (STATUS_VARIANT[c.from] ?? "neutral") : "neutral"}
                          size="sm"
                        >
                          {c.from ?? (c.steps?.[0]?.status ?? "Available")}
                        </Badge>
                        <ArrowRight size={14} strokeWidth={1.5} className="text-text-muted" aria-label={t.injuries.changedTo} />
                        <StatusBadge
                          status={c.to ?? (c.steps?.[c.steps.length - 1]?.status ?? "Available")}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
              {realChanges.length > 4 && (
                <button
                  type="button"
                  onClick={() => setShowAllChanges((v) => !v)}
                  className="mt-2 cursor-pointer text-xs font-medium text-primary hover:underline md:hidden"
                >
                  {showAllChanges
                    ? (tr ? "Daha az göster" : "Show less")
                    : (tr ? `Tümünü göster (${realChanges.length})` : `Show all (${realChanges.length})`)}
                </button>
              )}
            </section>
          )}

          {/* Filter Toolbar */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="w-full sm:w-52">
              <Input
                aria-label={t.injuries.searchPlayer}
                type="text"
                autoComplete="off"
                placeholder={tr ? "Oyuncu ara" : "Search player"}
                leftIcon={<Search size={16} strokeWidth={1.5} />}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="w-44">
              <Select aria-label={t.common.team} value={team} onChange={(e) => setTeam(e.target.value)} className="h-9">
                <option value="">
                  {tr ? "Tüm takımlar" : "All teams"}
                </option>
                {teams.map((abbr) => (
                  <option key={abbr} value={abbr}>
                    {isKnownTeamAbbr(abbr) ? `${abbr} — ${TEAM_NAME_BY_ABBR[abbr]}` : abbr}
                  </option>
                ))}
              </Select>
            </div>
            <div
              className="inline-flex items-center rounded border border-border bg-background-tertiary p-0.5 text-xs font-medium"
              role="group"
              aria-label={tr ? "Durum filtresi" : "Status filter"}
            >
              {filters.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={statusFilter === f.id}
                  onClick={() => setStatusFilter(f.id)}
                  className={`cursor-pointer rounded-sm px-2.5 py-1 tabular-nums transition-colors ${
                    statusFilter === f.id
                      ? "bg-background-primary font-semibold text-text-primary"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {f.label} <span className="text-text-muted">({f.count})</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              aria-pressed={rotationOnly}
              onClick={() => setRotationOnly((v) => !v)}
              className={`cursor-pointer rounded border px-2.5 py-1.5 text-xs font-medium tabular-nums transition-colors ${
                rotationOnly
                  ? "border-primary bg-background-primary font-semibold text-text-primary"
                  : "border-border bg-background-primary text-text-secondary hover:text-text-primary"
              }`}
            >
              {tr ? "Rotasyon" : "Rotation"} <span className="text-text-muted">({rotationCount})</span>
            </button>
          </div>

          {all.length === 0 ? (
            <EmptyState
              icon={<Stethoscope size={32} strokeWidth={1.5} />}
              title={
                data.live
                  ? (tr ? "Bu tarih için henüz rapor yayınlanmadı" : "No reports filed yet for this date")
                  : (tr ? "Bu tarih için kayıt bulunamadı" : "No records found for this date")
              }
              description={
                data.live
                  ? (tr
                    ? "Takımlar maçtan önceki gün ilk listelerini verir ve maç saatine kadar günceller."
                    : "Teams submit preliminary lists the evening before and update continuously until game time.")
                  : (tr
                    ? "Seçilen tarihte bildirilmiş herhangi bir sakatlık kaydı mevcut değil."
                    : "No injury reports were filed on this date.")
              }
            />
          ) : players.length === 0 ? (
            <EmptyState
              title={tr ? "Filtreye uyan oyuncu bulunamadı" : "No players match the filter"}
              description={tr ? "Seçtiğin kriterlere uyan sakatlık kaydı yok." : "No injury entries match your filter criteria."}
              actionLabel={t.injuries.clearFilter}
              onAction={resetFilters}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {Object.entries(playersByTeam).map(([teamAbbr, teamPlayers]) => {
                const teamOut = teamPlayers.filter((p) => p.status === "Out").length;
                const teamUncertain = teamPlayers.filter((p) => isUncertain(p.status)).length;
                const matchup = teamPlayers[0]?.matchup || "";
                const fullName = isKnownTeamAbbr(teamAbbr) ? TEAM_NAME_BY_ABBR[teamAbbr] : teamAbbr;

                return (
                  <Card
                    key={teamAbbr}
                    padding="none"
                    className="overflow-hidden"
                    aria-label={`${fullName} ${tr ? "sakatlık listesi" : "injury list"}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-light bg-background-tertiary/60 px-4 py-2.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <TeamLogo abbr={teamAbbr} name={fullName} size={24} className="shrink-0" />
                        <div className="min-w-0">
                          <h2 className="truncate text-sm font-semibold text-text-primary">{fullName}</h2>
                          {matchup && <p className="text-xs tabular-nums text-text-muted">{matchup}</p>}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        {teamOut > 0 && (
                          <Badge variant="error" size="sm">
                            <span className="tabular-nums">{teamOut}</span> Out
                          </Badge>
                        )}
                        {teamUncertain > 0 && (
                          <Badge variant="warning" size="sm">
                            <span className="tabular-nums">{teamUncertain}</span> {tr ? "belirsiz" : "uncertain"}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <ul className="divide-y divide-border-light">
                      {teamPlayers.map((p) => {
                        const pid = idFor(p.player_name, p.player_id);
                        const metaParts = [
                          p.games_missed > 0 ? `${p.games_missed} ${tr ? "maç" : "gm"}` : null,
                          p.minutes ? `${p.minutes.toFixed(1)} ${tr ? "dk" : "min"}` : null,
                        ].filter(Boolean);

                        return (
                          <li
                            key={`${p.team}-${p.player_name}`}
                            className="flex items-start justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-background-tertiary/40"
                            title={p.since ? (tr ? `${formatDate(p.since)} tarihinden beri` : `Since ${formatDate(p.since)}`) : undefined}
                          >
                            <button
                              type="button"
                              disabled={!pid}
                              onClick={() => openPlayer(pid)}
                              className="group flex min-w-0 flex-1 cursor-pointer items-start gap-2.5 text-left disabled:cursor-default"
                            >
                              <PlayerPhoto playerId={pid} name={p.player_name} size={30} className="mt-0.5 shrink-0" />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="truncate text-sm font-semibold text-text-primary group-hover:underline">
                                    {p.player_name}
                                  </span>
                                  {p.rotation && (
                                    <Badge variant="info" size="sm">{tr ? "Rotasyon" : "Rotation"}</Badge>
                                  )}
                                </div>
                                <p className="mt-0.5 text-xs leading-snug text-text-secondary">
                                  {p.reason || "—"}
                                  {metaParts.length > 0 && (
                                    <span className="ml-2 tabular-nums text-text-muted">
                                      · {metaParts.join(" · ")}
                                    </span>
                                  )}
                                </p>
                              </div>
                            </button>
                            <div className="shrink-0 pt-0.5">
                              <StatusBadge status={p.status} />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </Card>
                );
              })}
            </div>
          )}

          {data.recent_returns.length > 0 && (
            <Card padding="none" className="overflow-hidden">
              <div className="border-b border-border-light px-4 py-2.5" title={t.injuries.returnsSubtitle}>
                <h2 className="text-sm font-semibold text-text-primary">{t.injuries.returnsTitle}</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-background-tertiary/60 text-xs text-text-secondary">
                    <tr>
                      <th scope="col" className="px-4 py-2 font-medium">{t.common.player}</th>
                      <th scope="col" className="px-4 py-2 font-medium">{tr ? "Dönüş tarihi" : "Return date"}</th>
                      <th scope="col" className="hidden px-4 py-2 font-medium sm:table-cell">{tr ? "Sakatlık dönemi" : "Injury period"}</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">{tr ? "Kaçırılan maç" : "Games missed"}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-light">
                    {data.recent_returns.map((r) => {
                      const pid = idFor(r.player_name);
                      return (
                        <tr key={`${r.team}-${r.player_name}`} className="transition-colors hover:bg-background-tertiary/40">
                          <td className="whitespace-nowrap px-4 py-2">
                            <button
                              type="button"
                              disabled={!pid}
                              onClick={() => openPlayer(pid)}
                              className="group inline-flex cursor-pointer items-center gap-2.5 text-left disabled:cursor-default"
                            >
                              <PlayerPhoto playerId={pid} name={r.player_name} size={28} className="shrink-0" />
                              <span className="font-semibold text-text-primary group-hover:underline">{r.player_name}</span>
                              <span className="text-xs text-text-muted">{r.team}</span>
                            </button>
                          </td>
                          <td className="whitespace-nowrap px-4 py-2 tabular-nums text-status-success">
                            {formatDate(r.returned_on)}
                          </td>
                          <td className="hidden whitespace-nowrap px-4 py-2 tabular-nums text-text-secondary sm:table-cell">
                            {formatDate(r.listed_from)} – {formatDate(r.listed_to)}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums text-text-secondary">
                            {r.games_missed} {tr ? "maç" : "games"}
                          </td>
                        </tr>
                      );
                    })}
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
