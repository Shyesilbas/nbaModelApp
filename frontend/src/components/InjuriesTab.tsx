import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Flame, Search, Stethoscope } from "lucide-react";
import { Badge, Button, Card, DatePicker, EmptyState, InlineError, Input, Select, Skeleton } from "./common";
import TeamLogo from "./TeamLogo";
import PlayerPhoto from "./PlayerPhoto";
import { loadPrivateApi, loadPrivateApiFresh } from "../lib/dataCache";
import { CURRENT_SEASON } from "../lib/constants";
import { reportStampText } from "../lib/injuryTime";
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

const todayEt = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

function StatusBadge({ status }: { status: string | null }) {
  const { t } = useLanguage();
  if (!status) return <Badge variant="neutral" size="sm">{t.injuries.notSpecified}</Badge>;
  return <Badge variant={STATUS_VARIANT[status] ?? "neutral"} size="sm">{status}</Badge>;
}

function InjuriesSkeleton() {
  const { t } = useLanguage();
  return (
    <div className="space-y-4" aria-busy="true" aria-label={t.injuries.loadingReport}>
      <Skeleton className="h-9 w-full rounded" />
      <Skeleton className="h-80 w-full rounded" />
    </div>
  );
}

export default function InjuriesTab() {
  const { t, language, formatDate } = useLanguage();
  const [date, setDate] = useState<string>(todayEt());
  const [reloadKey, setReloadKey] = useState(0);
  const [showAllChanges, setShowAllChanges] = useState(false);
  const [result, setResult] = useState<{ key: string; data?: Payload; error?: string } | null>(null);
  const [team, setTeam] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [rotationOnly, setRotationOnly] = useState(false);

  const requestKey = `${date}|${reloadKey}`;

  // The report only carries ids for some rows; profiles let every row show a headshot.
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
    () => Array.from(new Set([...(result?.data?.stored_days ?? []), todayEt(), date])).sort(),
    [result, date]
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
    { id: "all", label: t.common.all, count: all.length },
    { id: "out", label: "Out", count: outCount },
    { id: "uncertain", label: language === "tr" ? "Belirsiz" : "Uncertain", count: uncertainCount },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1
          className="text-base font-semibold text-text-primary md:text-lg"
          title={language === "tr" ? "Resmi NBA sakatlık bülteni, 15 dakikada bir senkronize edilir" : "Official NBA injury report, synchronized every 15 minutes"}
        >
          {language === "tr" ? "Sakatlık raporu" : "Injury report"}
        </h1>

        <div className="flex flex-wrap items-center gap-2">
          {data?.published_et && (
            <Badge variant="success" dot>
              {language === "tr" ? "Bülten: " : "Report: "}{reportStampText(data.published_et)}
            </Badge>
          )}
          <DatePicker
            dates={days}
            value={date}
            onChange={setDate}
            todayStr={todayEt()}
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
          {data.not_filed.length > 0 && (
            <p className="text-xs text-text-secondary">
              <span className="font-medium text-text-primary">
                {language === "tr" ? "Rapor bildirmeyen takımlar: " : "Teams yet to file: "}
              </span>
              {data.not_filed.join(", ")}
            </p>
          )}

          {realChanges.length > 0 && (
            <section aria-labelledby="injury-changes" className="rounded border border-status-warning/30 bg-status-warning/5 p-3">
              <h2 id="injury-changes" className="mb-2 flex items-center gap-2 text-sm font-semibold text-text-primary">
                <Flame size={16} strokeWidth={1.5} className="text-status-warning" aria-hidden="true" />
                {t.injuries.changesTitle}
                <span className="text-xs font-normal tabular-nums text-text-secondary">{realChanges.length}</span>
              </h2>
              <ul className="grid grid-cols-1 gap-2 xl:grid-cols-2 2xl:grid-cols-3">
                {realChanges.map((c, i) => (
                  <li
                    key={`${c.team}-${c.player_name}-${i}`}
                    className={`${!showAllChanges && i >= 4 ? "hidden md:flex" : "flex"} items-center justify-between gap-2 rounded border border-border bg-background-primary px-2.5 py-1.5`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-text-primary">{c.player_name}</p>
                      <p className="truncate text-xs text-text-secondary">{c.team} · {c.matchup}</p>
                    </div>
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
                ))}
              </ul>
              {realChanges.length > 4 && (
                <button
                  type="button"
                  onClick={() => setShowAllChanges((v) => !v)}
                  className="mt-2 cursor-pointer text-xs font-medium text-primary hover:underline md:hidden"
                >
                  {showAllChanges
                    ? (language === "tr" ? "Daha az göster" : "Show less")
                    : (language === "tr" ? `Tümünü göster (${realChanges.length})` : `Show all (${realChanges.length})`)}
                </button>
              )}
            </section>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <div className="w-full sm:w-48">
              <Input
                aria-label={t.injuries.searchPlayer}
                type="text"
                autoComplete="off"
                placeholder={language === "tr" ? "Oyuncu ara" : "Search player"}
                leftIcon={<Search size={16} strokeWidth={1.5} />}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="w-36">
              <Select aria-label={t.common.team} value={team} onChange={(e) => setTeam(e.target.value)} className="h-9">
                <option value="">
                  {language === "tr" ? "Tüm takımlar" : "All teams"}
                </option>
                {teams.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={language === "tr" ? "Durum filtresi" : "Status filter"}>
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
                {language === "tr" ? "Rotasyon" : "Rotation"} <span className="tabular-nums">({rotationCount})</span>
              </Button>
            </div>
          </div>

          {all.length === 0 ? (
            <EmptyState
              icon={<Stethoscope size={32} strokeWidth={1.5} />}
              title={
                data.live
                  ? (language === "tr" ? "Bugün için henüz rapor yayınlanmadı" : "No reports filed yet for today")
                  : (language === "tr" ? "Bu tarih için kayıt bulunamadı" : "No records found for this date")
              }
              description={
                data.live
                  ? (language === "tr"
                    ? "Takımlar maçtan önceki gün ilk listelerini verir ve maç saatine kadar günceller."
                    : "Teams submit preliminary lists the evening before and update continuously until game time.")
                  : (language === "tr"
                    ? "Seçilen tarihte bildirilmiş herhangi bir sakatlık kaydı mevcut değil."
                    : "No injury reports were filed on this date.")
              }
            />
          ) : players.length === 0 ? (
            <EmptyState
              title={language === "tr" ? "Filtreye uyan oyuncu bulunamadı" : "No players match the filter"}
              description={language === "tr" ? "Seçtiğin kriterlere uyan sakatlık kaydı yok." : "No injury entries match your filter criteria."}
              actionLabel={t.injuries.clearFilter}
              onAction={resetFilters}
            />
          ) : (
            <div className="space-y-3">
              {Object.entries(playersByTeam).map(([teamAbbr, teamPlayers]) => {
                const teamOut = teamPlayers.filter((p) => p.status === "Out").length;
                const teamUncertain = teamPlayers.filter((p) => isUncertain(p.status)).length;
                const matchup = teamPlayers[0]?.matchup || "";

                return (
                  <Card key={teamAbbr} padding="none" className="overflow-hidden" aria-label={`${teamAbbr} ${language === "tr" ? "sakatlık listesi" : "injury list"}`}>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-light bg-background-tertiary px-4 py-2">
                      <div className="flex items-center gap-2.5">
                        <TeamLogo abbr={teamAbbr} name="" size={24} />
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
                            <span className="tabular-nums">{teamUncertain}</span> {language === "tr" ? "belirsiz" : "uncertain"}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <caption className="sr-only">
                          {language === "tr"
                            ? `${teamAbbr} için raporlanan sakat oyuncular`
                            : `Injured players reported for ${teamAbbr}`}
                        </caption>
                        <thead className="border-b border-border-light text-xs text-text-secondary">
                          <tr>
                            <th scope="col" className="px-4 py-1.5 font-medium">{t.common.player}</th>
                            <th scope="col" className="px-4 py-1.5 font-medium">{t.injuries.statusBadge}</th>
                            <th scope="col" className="px-4 py-1.5 font-medium">{language === "tr" ? "Gerekçe" : "Reason"}</th>
                            <th scope="col" className="hidden px-4 py-1.5 text-right font-medium md:table-cell">{language === "tr" ? "Kaçırılan" : "Missed"}</th>
                            <th scope="col" className="hidden px-4 py-1.5 text-right font-medium md:table-cell">{language === "tr" ? "Dk ort." : "Min avg"}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-light">
                          {teamPlayers.map((p) => (
                            <tr key={`${p.team}-${p.player_name}`} className="hover:bg-background-secondary">
                              <td className="whitespace-nowrap px-4 py-1.5">
                                <div
                                  className="flex items-center gap-2.5"
                                  title={language === "tr" ? `${p.since} tarihinden beri` : `Since ${p.since}`}
                                >
                                  <PlayerPhoto playerId={idFor(p.player_name, p.player_id)} name={p.player_name} size={28} className="shrink-0" />
                                  <span className="font-semibold text-text-primary">{p.player_name}</span>
                                  {p.rotation && <Badge variant="info" size="sm">{language === "tr" ? "Rotasyon" : "Rotation"}</Badge>}
                                </div>
                              </td>
                              <td className="whitespace-nowrap px-4 py-1.5">
                                <StatusBadge status={p.status} />
                              </td>
                              <td className="max-w-md px-4 py-1.5 text-xs leading-snug text-text-secondary">
                                {p.reason || "—"}
                              </td>
                              <td className="hidden px-4 py-1.5 text-right tabular-nums text-text-secondary md:table-cell">
                                {p.games_missed > 0 ? `${p.games_missed} ${language === "tr" ? "maç" : "games"}` : "—"}
                              </td>
                              <td className="hidden px-4 py-1.5 text-right tabular-nums text-text-secondary md:table-cell">
                                {p.minutes ? `${p.minutes.toFixed(1)} ${language === "tr" ? "dk" : "min"}` : "—"}
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
              <div className="border-b border-border-light px-4 py-2" title={t.injuries.returnsSubtitle}>
                <h2 className="text-sm font-semibold text-text-primary">{t.injuries.returnsTitle}</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-background-tertiary text-xs text-text-secondary">
                    <tr>
                      <th scope="col" className="px-4 py-2 font-medium">{t.common.player}</th>
                      <th scope="col" className="px-4 py-2 font-medium">{language === "tr" ? "Dönüş tarihi" : "Return date"}</th>
                      <th scope="col" className="hidden px-4 py-1.5 font-medium sm:table-cell">{language === "tr" ? "Sakatlık dönemi" : "Injury period"}</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">{language === "tr" ? "Kaçırılan maç" : "Games missed"}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-light">
                    {data.recent_returns.map((r) => (
                      <tr key={`${r.team}-${r.player_name}`} className="hover:bg-background-secondary">
                        <td className="whitespace-nowrap px-4 py-1.5">
                          <span className="inline-flex items-center gap-2.5">
                            <PlayerPhoto playerId={idFor(r.player_name)} name={r.player_name} size={28} className="shrink-0" />
                            <span className="font-semibold text-text-primary">{r.player_name}</span>
                            <span className="text-xs text-text-muted">{r.team}</span>
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-1.5 tabular-nums text-status-success">{r.returned_on}</td>
                        <td className="hidden whitespace-nowrap px-4 py-1.5 tabular-nums text-text-secondary sm:table-cell">
                          {r.listed_from} – {r.listed_to}
                        </td>
                        <td className="px-4 py-1.5 text-right tabular-nums text-text-secondary">
                          {r.games_missed} {language === "tr" ? "maç" : "games"}
                        </td>
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
