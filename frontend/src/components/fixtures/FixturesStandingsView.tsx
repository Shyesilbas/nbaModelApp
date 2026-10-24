import React, { useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import TeamLogo from "../TeamLogo";
import type { ConferenceFilter, TeamStanding } from "./types";
import type { GameFeedRow } from "../../types/gameFeed";
import { NBA_TEAM_ABBRS, TEAM_NAME_BY_ABBR, getTeamShortName, isKnownTeamAbbr } from "../../lib/nbaTeams";
import { useLanguage } from "../../context/LanguageContext";

const EAST_TEAMS = new Set([
  "ATL", "BOS", "BKN", "CHA", "CHI", "CLE", "DET", "IND",
  "MIA", "MIL", "NYK", "ORL", "PHI", "TOR", "WAS",
]);

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
    const map = new Map<string, {
      w: number;
      l: number;
      hw: number;
      hl: number;
      aw: number;
      al: number;
      pf: number;
      pa: number;
      history: ("W" | "L")[];
    }>();

    for (const abbr of NBA_TEAM_ABBRS) {
      map.set(abbr, {
        w: 0,
        l: 0,
        hw: 0,
        hl: 0,
        aw: 0,
        al: 0,
        pf: 0,
        pa: 0,
        history: [],
      });
    }

    // Sort games chronologically so streak and form are exact
    const sorted = [...games].sort((a, b) => (a.GAME_DATE ?? "").localeCompare(b.GAME_DATE ?? ""));

    for (const g of sorted) {
      // Official 82-game regular season games only
      if (g.SEASON_TYPE !== "Regular Season") continue;

      const isCompleted =
        g.GAME_STATUS === "Final" ||
        g.GAME_STATUS === "FINAL" ||
        Boolean(g.WINNER_TEAM_ABBREVIATION) ||
        ((Number(g.HOME_SCORE) || 0) > 0 && (Number(g.AWAY_SCORE) || 0) > 0);

      if (!isCompleted) continue;

      const home = g.HOME_TEAM_ABBREVIATION;
      const away = g.AWAY_TEAM_ABBREVIATION;
      if (!home || !away) continue;

      const hStats = map.get(home);
      const aStats = map.get(away);
      if (!hStats || !aStats) continue;

      const hScore = Number(g.HOME_SCORE) || 0;
      const aScore = Number(g.AWAY_SCORE) || 0;
      const homeWon = g.WINNER_TEAM_ABBREVIATION
        ? g.WINNER_TEAM_ABBREVIATION === home
        : hScore > aScore;

      hStats.pf += hScore;
      hStats.pa += aScore;
      aStats.pf += aScore;
      aStats.pa += hScore;

      if (homeWon) {
        hStats.w += 1;
        hStats.hw += 1;
        aStats.l += 1;
        aStats.al += 1;
        hStats.history.push("W");
        aStats.history.push("L");
      } else {
        hStats.l += 1;
        hStats.hl += 1;
        aStats.w += 1;
        aStats.aw += 1;
        hStats.history.push("L");
        aStats.history.push("W");
      }
    }

    const allList: TeamStanding[] = [];

    for (const abbr of NBA_TEAM_ABBRS) {
      const s = map.get(abbr)!;
      const gp = s.w + s.l;
      const pct = gp > 0 ? s.w / gp : 0;
      const ppgNum = gp > 0 ? s.pf / gp : 0;
      const oppPpgNum = gp > 0 ? s.pa / gp : 0;
      const diffNum = gp > 0 ? ppgNum - oppPpgNum : 0;

      // Last 10 games
      const last10 = s.history.slice(-10);
      const l10Wins = last10.filter((x) => x === "W").length;
      const l10Losses = last10.length - l10Wins;

      // Current Streak
      let streak = "-";
      if (s.history.length > 0) {
        const lastRes = s.history[s.history.length - 1];
        let count = 0;
        for (let i = s.history.length - 1; i >= 0; i--) {
          if (s.history[i] === lastRes) count++;
          else break;
        }
        streak = `${lastRes}${count}`;
      }

      allList.push({
        rank: 0,
        abbr,
        fullName: isKnownTeamAbbr(abbr) ? TEAM_NAME_BY_ABBR[abbr] : abbr,
        name: getTeamShortName(abbr, isKnownTeamAbbr(abbr) ? TEAM_NAME_BY_ABBR[abbr] : abbr),
        conference: EAST_TEAMS.has(abbr) ? "East" : "West",
        gp,
        w: s.w,
        l: s.l,
        pct,
        pctFormatted: pct.toFixed(3).replace(/^0/, ""),
        gb: "-",
        ptsFor: s.pf,
        ptsAgainst: s.pa,
        ppg: ppgNum.toFixed(1),
        oppPpg: oppPpgNum.toFixed(1),
        diff: (diffNum > 0 ? `+${diffNum.toFixed(1)}` : diffNum.toFixed(1)),
        diffNum,
        homeRecord: `${s.hw}-${s.hl}`,
        awayRecord: `${s.aw}-${s.al}`,
        l10: `${l10Wins}-${l10Losses}`,
        streak,
        form: s.history.slice(-5),
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
          <div className="flex h-9 w-9 items-center justify-center rounded bg-amber-500/10 text-amber-500">
            <Trophy className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">
              {t.fixtures.standingsTitle}
            </h3>
            <p className="text-xs text-text-muted">
              {t.fixtures.standingsSubtitle.replace("{season}", season)}
            </p>
          </div>
        </div>

        {/* Conference Tabs */}
        <div className="flex items-center rounded border border-border bg-background-tertiary p-1 gap-1 self-stretch sm:self-auto justify-center">
          <button
            type="button"
            onClick={() => setConferenceFilter("all")}
            className={`rounded px-3 py-1.5 text-xs font-semibold transition-all ${
              conferenceFilter === "all"
                ? "bg-primary text-white "
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {t.common.all}
          </button>
          <button
            type="button"
            onClick={() => setConferenceFilter("east")}
            className={`rounded px-3 py-1.5 text-xs font-semibold transition-all ${
              conferenceFilter === "east"
                ? "bg-primary text-white "
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {t.fixtures.easternConference}
          </button>
          <button
            type="button"
            onClick={() => setConferenceFilter("west")}
            className={`rounded px-3 py-1.5 text-xs font-semibold transition-all ${
              conferenceFilter === "west"
                ? "bg-primary text-white "
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {t.fixtures.westernConference}
          </button>
        </div>
      </div>

      {/* Standings Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-border text-xs font-semibold text-text-muted bg-background-tertiary/50">
              <th className="py-2.5 px-3 w-12 text-center">#</th>
              <th className="py-2.5 px-3 min-w-[180px]">{t.common.team}</th>
              <th className="py-2.5 px-2 text-center w-10" title={language === "tr" ? "Oynanan maç" : "Games Played"}>
                {language === "tr" ? "O" : "GP"}
              </th>
              <th className="py-2.5 px-2 text-center w-10" title={language === "tr" ? "Galibiyet" : "Wins"}>
                {language === "tr" ? "G" : "W"}
              </th>
              <th className="py-2.5 px-2 text-center w-10" title={language === "tr" ? "Mağlubiyet" : "Losses"}>
                {language === "tr" ? "M" : "L"}
              </th>
              <th className="py-2.5 px-2 text-center w-12 font-semibold text-text-primary" title={t.fixtures.winRate}>
                {t.fixtures.pct}
              </th>
              <th className="py-2.5 px-2 text-center w-12" title={t.fixtures.gamesBehind}>
                {t.fixtures.gamesBehind}
              </th>
              <th className="py-2.5 px-2 text-center w-14 hidden md:table-cell" title={t.fixtures.pointsFor}>
                {language === "tr" ? "Sayı" : "PPG"}
              </th>
              <th className="py-2.5 px-2 text-center w-14 hidden md:table-cell" title={t.fixtures.pointsAgainst}>
                {language === "tr" ? "Y.Sayı" : "OPP"}
              </th>
              <th className="py-2.5 px-2 text-center w-12" title={t.fixtures.pointDiff}>
                {language === "tr" ? "AV" : "DIFF"}
              </th>
              <th className="py-2.5 px-2 text-center w-16 hidden lg:table-cell" title={language === "tr" ? "İç saha" : "Home record"}>
                {t.fixtures.homeRecord}
              </th>
              <th className="py-2.5 px-2 text-center w-16 hidden lg:table-cell" title={language === "tr" ? "Deplasman" : "Away record"}>
                {t.fixtures.awayRecord}
              </th>
              <th className="py-2.5 px-2 text-center w-14 hidden sm:table-cell" title={language === "tr" ? "Son 10 maç" : "Last 10"}>
                {t.fixtures.l10}
              </th>
              <th className="py-2.5 px-2 text-center w-12 hidden sm:table-cell" title={language === "tr" ? "Mevcut seri" : "Streak"}>
                {t.fixtures.streak}
              </th>
              <th className="py-2.5 px-3 text-center w-28 hidden sm:table-cell" title={t.fixtures.recentForm}>
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
                  className="transition-colors hover:bg-background-tertiary/60 group"
                >
                  {/* Rank */}
                  <td className="py-2.5 px-3 text-center tabular-nums font-semibold text-text-secondary">
                    <div className="flex items-center justify-center gap-1.5">
                      {isDirectPlayoff && (
                        <span className="h-1.5 w-1.5 rounded-full bg-status-success" title="Dogrudan Playoff (1-6)" />
                      )}
                      {isPlayIn && (
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title="Play-In Turnuvasi (7-10)" />
                      )}
                      {isLottery && (
                        <span className="h-1.5 w-1.5 rounded-full bg-border" />
                      )}
                      <span>{t.rank}</span>
                    </div>
                  </td>

                  {/* Team */}
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2.5">
                      <TeamLogo abbr={t.abbr} name={t.name} size={22} className="shrink-0" />
                      <button
                        type="button"
                        onClick={() => onSelectTeam?.(t.abbr)}
                        className="truncate text-left font-semibold text-text-primary transition-colors hover:underline hover:text-primary"
                        title={t.fullName || t.name}
                      >
                        <span className="hidden md:inline">{t.name}</span>
                        <span className="inline md:hidden">{t.abbr}</span>
                      </button>
                      <span className="hidden tabular-nums text-xs font-semibold text-text-muted lg:inline">
                        {t.abbr}
                      </span>
                    </div>
                  </td>

                  {/* Stats */}
                  <td className="py-2.5 px-2 text-center font-semibold text-text-primary">{t.gp}</td>
                  <td className="py-2.5 px-2 text-center font-semibold text-status-success">{t.w}</td>
                  <td className="py-2.5 px-2 text-center text-text-secondary">{t.l}</td>
                  <td className="py-2.5 px-2 text-center tabular-nums font-semibold text-text-primary">{t.pctFormatted}</td>
                  <td className="py-2.5 px-2 text-center tabular-nums text-text-muted">{t.gb}</td>
                  <td className="py-2.5 px-2 text-center tabular-nums text-text-secondary hidden md:table-cell">{t.ppg}</td>
                  <td className="py-2.5 px-2 text-center tabular-nums text-text-secondary hidden md:table-cell">{t.oppPpg}</td>
                  <td className={`py-2.5 px-2 text-center tabular-nums font-semibold ${
                    t.diffNum > 0 ? "text-status-success" : t.diffNum < 0 ? "text-status-error" : "text-text-muted"
                  }`}>
                    {t.diff}
                  </td>
                  <td className="py-2.5 px-2 text-center tabular-nums text-text-muted hidden lg:table-cell">{t.homeRecord}</td>
                  <td className="py-2.5 px-2 text-center tabular-nums text-text-muted hidden lg:table-cell">{t.awayRecord}</td>
                  <td className="py-2.5 px-2 text-center tabular-nums text-text-secondary hidden sm:table-cell">{t.l10}</td>
                  <td className="py-2.5 px-2 text-center tabular-nums font-semibold text-text-primary hidden sm:table-cell">{t.streak}</td>

                  {/* Form */}
                  <td className="py-2.5 px-3 text-center hidden sm:table-cell">
                    <div className="flex items-center justify-center gap-1">
                      {t.form.map((res, i) => (
                        <span
                          key={i}
                          className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold text-white ${
                            res === "W" ? "bg-status-success" : "bg-status-error"
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-xs font-medium text-text-muted">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-status-success" />
            <span>{language === "tr" ? "Doğrudan Playoff (1-6)" : "Playoffs Seed (1-6)"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <span>{language === "tr" ? "Play-In Turnuvası (7-10)" : "Play-In Tournament (7-10)"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-border" />
            <span>{language === "tr" ? "Piyango / Elenenler (11-15)" : "Lottery / Eliminated (11-15)"}</span>
          </div>
        </div>

        <div className="tabular-nums text-xs text-text-muted">
          {language === "tr"
            ? "O: oynanan • G: galibiyet • M: mağlubiyet • %: yüzde • Fark: galibiyet farkı • AV: averaj"
            : "GP: games played • W: wins • L: losses • %: win pct • GB: games behind • DIFF: point diff"}
        </div>
      </div>
    </div>
  );
};
