import React, { useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import TeamLogo from "../TeamLogo";
import type { ConferenceFilter, TeamStanding } from "./types";
import type { GameFeedRow } from "../../types/gameFeed";
import { computeSeasonTeamRecords } from "../../lib/teamRecords";
import { useLanguage } from "../../context/LanguageContext";

interface FixturesStandingsViewProps {
  games: GameFeedRow[];
  season: string;
  onSelectTeam?: (abbr: string) => void;
}

export const FixturesStandingsView: React.FC<FixturesStandingsViewProps> = ({
  games,
  season,
  onSelectTeam,
}) => {
  const { t, language } = useLanguage();
  const [conferenceFilter, setConferenceFilter] = useState<ConferenceFilter>("all");

  const standings = useMemo(() => {
    const recordsMap = computeSeasonTeamRecords(games);
    const allList: TeamStanding[] = [];

    for (const s of recordsMap.values()) {
      const last10 = s.history.slice(-10);
      const l10Wins = last10.filter((x) => x === "W").length;
      const l10Losses = last10.length - l10Wins;

      allList.push({
        rank: 0,
        abbr: s.abbr,
        fullName: s.fullName,
        name: s.name,
        conference: s.conference,
        gp: s.gp,
        w: s.w,
        l: s.l,
        pct: s.pct,
        pctFormatted: s.pctFormatted,
        gb: "-",
        ptsFor: s.ptsFor,
        ptsAgainst: s.ptsAgainst,
        ppg: s.ppg,
        oppPpg: s.oppPpg,
        diff: s.diff,
        diffNum: s.diffNum,
        homeRecord: s.homeRecord,
        awayRecord: s.awayRecord,
        l10: `${l10Wins}-${l10Losses}`,
        streak: s.streak,
        form: s.form,
      });
    }

    return allList;
  }, [games]);

  const displayedStandings = useMemo(() => {
    let pool = [...standings];
    if (conferenceFilter === "east") pool = pool.filter((t) => t.conference === "East");
    else if (conferenceFilter === "west") pool = pool.filter((t) => t.conference === "West");

    // Sort by Win percentage descending, then total wins, then net point diff
    pool.sort((a, b) => {
      if (b.pct !== a.pct) return b.pct - a.pct;
      if (b.w !== a.w) return b.w - a.w;
      return b.diffNum - a.diffNum;
    });

    const leader = pool[0];
    return pool.map((t, index) => {
      let gb = "-";
      if (leader && index > 0) {
        const gbNum = ((leader.w - t.w) + (t.l - leader.l)) / 2;
        gb = gbNum <= 0 ? "-" : String(gbNum % 1 === 0 ? gbNum : gbNum.toFixed(1));
      }
      return {
        ...t,
        rank: index + 1,
        gb,
      };
    });
  }, [standings, conferenceFilter]);

  return (
    <div className="space-y-4 rounded border border-border bg-background-primary p-4 sm:p-5 ">
      {/* Header: Title + Conference Toggle */}
      <div className="flex flex-col items-start justify-between gap-3 border-b border-border pb-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded bg-status-warning/10 text-status-warning">
            <Trophy className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">
              {t.fixtures.standingsTitle}
            </h3>
            <p className="text-xs text-text-secondary">
              {t.fixtures.standingsSubtitle.replace("{season}", season)}
            </p>
          </div>
        </div>

        {/* Conference Tabs */}
        <div className="flex items-center justify-center gap-1 self-stretch rounded border border-border bg-background-tertiary p-1 sm:self-auto">
          <button
            type="button"
            onClick={() => setConferenceFilter("all")}
            className={`rounded px-3 py-1.5 text-xs font-semibold transition-all ${conferenceFilter === "all"
                ? "bg-primary text-white dark:text-background-secondary"
                : "text-text-secondary hover:text-text-primary"
              }`}
          >
            {t.common.all}
          </button>
          <button
            type="button"
            onClick={() => setConferenceFilter("east")}
            className={`rounded px-3 py-1.5 text-xs font-semibold transition-all ${conferenceFilter === "east"
                ? "bg-primary text-white dark:text-background-secondary"
                : "text-text-secondary hover:text-text-primary"
              }`}
          >
            {t.fixtures.easternConference}
          </button>
          <button
            type="button"
            onClick={() => setConferenceFilter("west")}
            className={`rounded px-3 py-1.5 text-xs font-semibold transition-all ${conferenceFilter === "west"
                ? "bg-primary text-white dark:text-background-secondary"
                : "text-text-secondary hover:text-text-primary"
              }`}
          >
            {t.fixtures.westernConference}
          </button>
        </div>
      </div>

      {/* Standings Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-border bg-background-tertiary/50 text-xs font-semibold text-text-secondary">
              <th className="w-12 px-3 py-2.5 text-center">#</th>
              <th className="min-w-[180px] px-3 py-2.5">{t.common.team}</th>
              <th className="w-10 px-2 py-2.5 text-center" title={language === "tr" ? "Oynanan maç" : "Games Played"}>
                {language === "tr" ? "O" : "GP"}
              </th>
              <th className="w-10 px-2 py-2.5 text-center" title={language === "tr" ? "Galibiyet" : "Wins"}>
                {language === "tr" ? "G" : "W"}
              </th>
              <th className="w-10 px-2 py-2.5 text-center" title={language === "tr" ? "Mağlubiyet" : "Losses"}>
                {language === "tr" ? "M" : "L"}
              </th>
              <th className="w-12 px-2 py-2.5 text-center font-semibold text-text-primary" title={t.fixtures.winRate}>
                {t.fixtures.pct}
              </th>
              <th className="w-12 px-2 py-2.5 text-center" title={t.fixtures.gamesBehind}>
                {t.fixtures.gamesBehind}
              </th>
              <th className="hidden w-14 px-2 py-2.5 text-center md:table-cell" title={t.fixtures.pointsFor}>
                {language === "tr" ? "Sayı" : "PPG"}
              </th>
              <th className="hidden w-14 px-2 py-2.5 text-center md:table-cell" title={t.fixtures.pointsAgainst}>
                {language === "tr" ? "Y.Sayı" : "OPP"}
              </th>
              <th className="w-12 px-2 py-2.5 text-center" title={t.fixtures.pointDiff}>
                {language === "tr" ? "AV" : "DIFF"}
              </th>
              <th className="hidden w-16 px-2 py-2.5 text-center lg:table-cell" title={language === "tr" ? "İç saha" : "Home record"}>
                {t.fixtures.homeRecord}
              </th>
              <th className="hidden w-16 px-2 py-2.5 text-center lg:table-cell" title={language === "tr" ? "Deplasman" : "Away record"}>
                {t.fixtures.awayRecord}
              </th>
              <th className="hidden w-14 px-2 py-2.5 text-center sm:table-cell" title={language === "tr" ? "Son 10 maç" : "Last 10"}>
                {t.fixtures.l10}
              </th>
              <th className="hidden w-12 px-2 py-2.5 text-center sm:table-cell" title={language === "tr" ? "Mevcut seri" : "Streak"}>
                {t.fixtures.streak}
              </th>
              <th className="hidden w-28 px-3 py-2.5 text-center sm:table-cell" title={t.fixtures.recentForm}>
                Form
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {displayedStandings.map((t) => {
              const isDirectPlayoff = conferenceFilter !== "all" && t.rank <= 6;
              const isPlayIn = conferenceFilter !== "all" && t.rank >= 7 && t.rank <= 10;
              const isLottery = conferenceFilter !== "all" && t.rank > 10;

              return (
                <tr
                  key={t.abbr}
                  className="group transition-colors hover:bg-background-tertiary"
                >
                  {/* Rank */}
                  <td className="px-3 py-2.5 text-center font-semibold tabular-nums text-text-secondary">
                    <div className="flex items-center justify-center gap-1.5">
                      {isDirectPlayoff && (
                        <span className="h-1.5 w-1.5 rounded-full bg-status-success" title="Dogrudan Playoff (1-6)" />
                      )}
                      {isPlayIn && (
                        <span className="h-1.5 w-1.5 rounded-full bg-status-warning" title="Play-In Turnuvasi (7-10)" />
                      )}
                      {isLottery && (
                        <span className="h-1.5 w-1.5 rounded-full bg-border" />
                      )}
                      <span>{t.rank}</span>
                    </div>
                  </td>

                  {/* Team */}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <TeamLogo abbr={t.abbr} name={t.name} size={22} className="shrink-0" />
                      <button
                        type="button"
                        onClick={() => onSelectTeam?.(t.abbr)}
                        className="truncate text-left font-semibold text-text-primary transition-colors hover:text-primary hover:underline"
                        title={t.fullName || t.name}
                      >
                        <span className="hidden md:inline">{t.name}</span>
                        <span className="inline md:hidden">{t.abbr}</span>
                      </button>
                      <span className="hidden text-xs font-medium tabular-nums text-text-secondary lg:inline">
                        {t.abbr}
                      </span>
                    </div>
                  </td>

                  {/* Stats */}
                  <td className="px-2 py-2.5 text-center font-semibold tabular-nums text-text-primary">{t.gp}</td>
                  <td className="px-2 py-2.5 text-center font-semibold tabular-nums text-status-success">{t.w}</td>
                  <td className="px-2 py-2.5 text-center tabular-nums text-text-secondary">{t.l}</td>
                  <td className="px-2 py-2.5 text-center font-semibold tabular-nums text-text-primary">{t.pctFormatted}</td>
                  <td className="px-2 py-2.5 text-center tabular-nums text-text-secondary">{t.gb}</td>
                  <td className="hidden px-2 py-2.5 text-center tabular-nums text-text-secondary md:table-cell">{t.ppg}</td>
                  <td className="hidden px-2 py-2.5 text-center tabular-nums text-text-secondary md:table-cell">{t.oppPpg}</td>
                  <td className={`px-2 py-2.5 text-center font-semibold tabular-nums ${t.diffNum > 0 ? "text-status-success" : t.diffNum < 0 ? "text-status-error" : "text-text-secondary"
                    }`}>
                    {t.diff}
                  </td>
                  <td className="hidden px-2 py-2.5 text-center tabular-nums text-text-secondary lg:table-cell">{t.homeRecord}</td>
                  <td className="hidden px-2 py-2.5 text-center tabular-nums text-text-secondary lg:table-cell">{t.awayRecord}</td>
                  <td className="hidden px-2 py-2.5 text-center tabular-nums text-text-secondary sm:table-cell">{t.l10}</td>
                  <td className="hidden px-2 py-2.5 text-center font-semibold tabular-nums text-text-primary sm:table-cell">{t.streak}</td>

                  {/* Form */}
                  <td className="hidden px-3 py-2.5 text-center sm:table-cell">
                    <div className="flex items-center justify-center gap-1">
                      {t.form.map((res, i) => (
                        <span
                          key={i}
                          className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold text-white ${res === "W" ? "bg-status-success" : "bg-status-error"
                            }`}
                          title={res === "W" ? (language === "tr" ? "Galibiyet" : "Win") : (language === "tr" ? "Mağlubiyet" : "Loss")}
                        >
                          {res === "W" ? (language === "tr" ? "G" : "W") : (language === "tr" ? "M" : "L")}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-xs font-medium text-text-secondary">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-status-success" />
            <span>{language === "tr" ? "Doğrudan Playoff (1-6)" : "Playoffs Seed (1-6)"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-status-warning" />
            <span>{language === "tr" ? "Play-In Turnuvası (7-10)" : "Play-In Tournament (7-10)"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-border" />
            <span>{language === "tr" ? "Piyango / Elenenler (11-15)" : "Lottery / Eliminated (11-15)"}</span>
          </div>
        </div>

        <div className="tabular-nums text-xs text-text-secondary">
          {language === "tr"
            ? "O: oynanan • G: galibiyet • M: mağlubiyet • %: yüzde • Fark: galibiyet farkı • AV: averaj"
            : "GP: games played • W: wins • L: losses • %: win pct • GB: games behind • DIFF: point diff"}
        </div>
      </div>
    </div>
  );
};
