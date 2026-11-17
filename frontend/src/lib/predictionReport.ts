import { NBA_TEAMS, getTeamLogoUrl } from "./nbaTeams";
import { reportStampText } from "./injuryTime";
import type { NormalizedPrediction } from "../types/prediction";
import type { PlayerMatchupData } from "../components/prediction/PlayerMatchupModal";
import type { Language } from "../i18n";

interface ExportPredictionReportArgs {
  result: NormalizedPrediction;
  date: string;
  fallbackHome: string;
  fallbackAway: string;
  language?: Language;
}

const getTeamInfo = (abbr: string) =>
  NBA_TEAMS.find((t) => t.abbr === abbr) || { abbr, name: abbr, color: "#1e293b" };

const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export function exportPredictionAsPDF({
  result: resData,
  date: predDate,
  fallbackHome,
  fallbackAway,
  language = "tr",
}: ExportPredictionReportArgs) {
  if (!resData) return;

  const tr = language === "tr";
  const hInfo = getTeamInfo(resData.home_team || fallbackHome);
  const aInfo = getTeamInfo(resData.away_team || fallbackAway);
  const winnerAbbr = resData.win_probability?.predicted_winner || resData.predicted_winner || hInfo.abbr;
  const winnerInfo = getTeamInfo(winnerAbbr);

  const homeProb = Number(resData.win_probability?.home_win_probability ?? 0.5);
  const awayProb = Number(resData.win_probability?.away_win_probability ?? 0.5);

  const predHomeScore = resData.score_prediction?.predicted_home_score?.toFixed(1) ?? "—";
  const predAwayScore = resData.score_prediction?.predicted_away_score?.toFixed(1) ?? "—";
  const predMargin = Math.abs(Number(resData.score_prediction?.predicted_margin ?? 0)).toFixed(1);
  const predTotal = Number(resData.score_prediction?.predicted_total_points ?? 0).toFixed(1);

  const awayPlayers = (resData.player_predictions?.away_players || []).slice(0, 7);
  const homePlayers = (resData.player_predictions?.home_players || []).slice(0, 7);

  const injuryReport = resData.injury_report;
  const injuryPlayers: Array<{ team: string; player_name: string; status: string; reason?: string }> =
    injuryReport?.players || [];

  const awayInjuries = injuryPlayers.filter((p) => p.team === aInfo.abbr);
  const homeInjuries = injuryPlayers.filter((p) => p.team === hInfo.abbr);

  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  const fmtPct = (v: number) => (tr ? `%${(v * 100).toFixed(1)}` : `${(v * 100).toFixed(1)}%`);

  const getStatusBadge = (status: string) => {
    const s = (status || "").toLowerCase();
    if (s.includes("out")) {
      return '<span style="background: #fee2e2; color: #b91c1c; padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 9px; text-transform: uppercase;">OUT</span>';
    }
    if (s.includes("questionable") || s.includes("doubtful")) {
      return '<span style="background: #fef3c7; color: #b45309; padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 9px; text-transform: uppercase;">QUESTIONABLE</span>';
    }
    return '<span style="background: #dcfce7; color: #047857; padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 9px; text-transform: uppercase;">ACTIVE</span>';
  };

  const renderRosterRows = (players: PlayerMatchupData[]) => {
    if (!players || players.length === 0) {
      return `<tr><td colspan="5" style="text-align: center; color: #94a3b8; padding: 8px;">${
        tr ? "Projeksiyon bulunamadı" : "No projections available"
      }</td></tr>`;
    }
    return players
      .map(
        (p) => `
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 5px 6px; font-weight: 600; color: #0f172a; text-align: left;">${escapeHtml(p.player_name)}</td>
          <td style="padding: 5px 6px; text-align: center; color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 9px;">${escapeHtml(p.position_group || "—")}</td>
          <td style="padding: 5px 6px; text-align: right; font-variant-numeric: tabular-nums; font-weight: 600;">${Number(p.predicted_pts || 0).toFixed(1)}</td>
          <td style="padding: 5px 6px; text-align: right; font-variant-numeric: tabular-nums; color: #475569;">${Number(p.predicted_reb || 0).toFixed(1)}</td>
          <td style="padding: 5px 6px; text-align: right; font-variant-numeric: tabular-nums; color: #475569;">${Number(p.predicted_ast || 0).toFixed(1)}</td>
        </tr>
      `
      )
      .join("");
  };

  const renderInjuryList = (
    injuries: Array<{ team: string; player_name: string; status: string; reason?: string }>,
    teamName: string
  ) => {
    if (!injuries || injuries.length === 0) {
      return `<div style="font-size: 10px; color: #64748b; font-style: italic; padding: 4px 0;">${
        tr
          ? `${escapeHtml(teamName)} için sakatlık bildirimi yok.`
          : `No injury listings for ${escapeHtml(teamName)}.`
      }</div>`;
    }
    return injuries
      .map(
        (inj) => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 4px 0; border-bottom: 1px dashed #f1f5f9; font-size: 10px;">
          <div style="display: flex; flex-direction: column; overflow: hidden; padding-right: 8px;">
            <span style="font-weight: 600; color: #0f172a;">${escapeHtml(inj.player_name)}</span>
            ${inj.reason ? `<span style="font-size: 8.5px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(inj.reason)}</span>` : ""}
          </div>
          <div>${getStatusBadge(inj.status)}</div>
        </div>
      `
      )
      .join("");
  };

  const modelVer = resData.win_probability?.model_version ?? resData.score_prediction?.model_version ?? "";

  const html = `
    <!DOCTYPE html>
    <html lang="${language}">
      <head>
        <meta charset="utf-8" />
        <title>${tr ? "NBA Tahmin Raporu" : "NBA Prediction Report"} - ${escapeHtml(aInfo.abbr)} @ ${escapeHtml(hInfo.abbr)}</title>
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600&display=swap" rel="stylesheet">
        <style>
          @page {
            size: A4 portrait;
            margin: 10mm 12mm 10mm 12mm;
          }
          * {
            box-sizing: border-box;
          }
          body {
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
            color: #0f172a;
            background: #ffffff;
            margin: 0;
            padding: 0;
            font-size: 10px;
            line-height: 1.35;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 6px;
            margin-bottom: 10px;
          }
          .title-area h1 {
            margin: 0;
            font-size: 16px;
            font-weight: 600;
          }
          .title-area p {
            margin: 2px 0 0 0;
            font-size: 8.5px;
            color: #64748b;
            font-weight: 500;
          }
          .meta-pill {
            background: #f1f5f9;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 4px 10px;
            font-size: 9.5px;
            font-weight: 600;
            font-variant-numeric: tabular-nums;
            color: #334155;
          }
          .hero-card {
            background: #f8fafc;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            padding: 10px 14px;
            margin-bottom: 10px;
            display: grid;
            grid-template-columns: 1fr auto 1fr;
            align-items: center;
            gap: 10px;
          }
          .team-box {
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .team-box.away { justify-content: flex-start; }
          .team-box.home { justify-content: flex-end; text-align: right; }
          .team-logo {
            width: 40px;
            height: 40px;
            object-fit: contain;
          }
          .score-num {
            font-size: 24px;
            font-weight: 600;
            font-variant-numeric: tabular-nums;
            color: #0f172a;
          }
          .score-center {
            text-align: center;
            padding: 0 6px;
          }
          .kpi-row {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
            margin-bottom: 10px;
          }
          .kpi-box {
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 6px 8px;
            text-align: center;
          }
          .kpi-box-val {
            font-size: 13px;
            font-weight: 600;
            color: #0f172a;
            font-variant-numeric: tabular-nums;
          }
          .kpi-box-lbl {
            font-size: 8px;
            font-weight: 600;
            color: #64748b;
            margin-top: 2px;
          }
          .section-title {
            font-size: 10px;
            font-weight: 600;
            color: #0f172a;
            margin-bottom: 5px;
            padding-bottom: 3px;
            border-bottom: 1px solid #e2e8f0;
          }
          .columns-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin-bottom: 10px;
          }
          .panel {
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 8px 10px;
            background: #ffffff;
          }
          .panel-header {
            font-size: 9.5px;
            font-weight: 600;
            color: #1e293b;
            margin-bottom: 6px;
            padding-bottom: 3px;
            border-bottom: 1px solid #f1f5f9;
            display: flex;
            align-items: center;
            justify-content: space-between;
          }
          table.data-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 9px;
          }
          table.data-table th {
            background: #f8fafc;
            color: #475569;
            font-weight: 600;
            font-size: 8px;
            padding: 3px 5px;
            border-bottom: 1px solid #cbd5e1;
          }
          .footer {
            margin-top: 8px;
            padding-top: 6px;
            border-top: 1px solid #e2e8f0;
            display: flex;
            justify-content: space-between;
            font-size: 8px;
            color: #64748b;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title-area">
            <h1>${tr ? "NBA Maç Tahmin Raporu" : "NBA Matchup Prediction Report"}</h1>
            <p>${tr ? "İstatistiksel Model Çıktısı" : "Statistical Model Output"}</p>
          </div>
          <div class="meta-pill">
            ${tr ? "Tarih" : "Date"}: ${escapeHtml(predDate)}
          </div>
        </div>

        <div class="hero-card">
          <div class="team-box away">
            <img class="team-logo" src="${getTeamLogoUrl(aInfo.abbr)}" alt="${escapeHtml(aInfo.name)}" />
            <div>
              <div style="font-size: 12px; font-weight: 600;">${escapeHtml(aInfo.name)}</div>
              <div style="font-size: 8.5px; font-weight: 500; color: #64748b;">${tr ? "Deplasman" : "Away"} · ${fmtPct(awayProb)}</div>
            </div>
            <div class="score-num" style="margin-left: 6px;">${escapeHtml(predAwayScore)}</div>
          </div>

          <div class="score-center">
            <div style="font-size: 10px; font-weight: 600; color: #64748b; padding: 2px 7px; border: 1px solid #e2e8f0; border-radius: 9999px; background: #fff;">@</div>
          </div>

          <div class="team-box home">
            <div class="score-num" style="margin-right: 6px;">${escapeHtml(predHomeScore)}</div>
            <div>
              <div style="font-size: 12px; font-weight: 600;">${escapeHtml(hInfo.name)}</div>
              <div style="font-size: 8.5px; font-weight: 500; color: #64748b;">${tr ? "Ev Sahibi" : "Home"} · ${fmtPct(homeProb)}</div>
            </div>
            <img class="team-logo" src="${getTeamLogoUrl(hInfo.abbr)}" alt="${escapeHtml(hInfo.name)}" />
          </div>
        </div>

        <div class="kpi-row">
          <div class="kpi-box">
            <div class="kpi-box-val" style="color: #047857;">${escapeHtml(winnerInfo.abbr)} (${fmtPct(Math.max(homeProb, awayProb))})</div>
            <div class="kpi-box-lbl">${tr ? "Tahmini Galip" : "Projected Winner"}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-box-val">${escapeHtml(predMargin)} ${tr ? "Sayı" : "PTS"}</div>
            <div class="kpi-box-lbl">${tr ? "Beklenen Fark" : "Expected Margin"}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-box-val">${escapeHtml(predTotal)} ${tr ? "Sayı" : "PTS"}</div>
            <div class="kpi-box-lbl">${tr ? "Beklenen Toplam" : "Expected Total"}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-box-val">${escapeHtml(predAwayScore)} - ${escapeHtml(predHomeScore)}</div>
            <div class="kpi-box-lbl">${tr ? "Skor Tahmini" : "Projected Score"}</div>
          </div>
        </div>

        <div class="section-title">${tr ? "Oyuncu Projeksiyonları" : "Player Projections"}</div>
        <div class="columns-2">
          <div class="panel">
            <div class="panel-header">
              <span>${escapeHtml(aInfo.name)} (${escapeHtml(aInfo.abbr)})</span>
              <span style="font-size: 8px; color: #64748b;">${tr ? "Önde Gelenler" : "Top Projections"}</span>
            </div>
            <table class="data-table">
              <thead>
                <tr>
                  <th style="text-align: left;">${tr ? "Oyuncu" : "Player"}</th>
                  <th style="text-align: center;">${tr ? "Poz" : "Pos"}</th>
                  <th style="text-align: right;">PTS</th>
                  <th style="text-align: right;">REB</th>
                  <th style="text-align: right;">AST</th>
                </tr>
              </thead>
              <tbody>
                ${renderRosterRows(awayPlayers)}
              </tbody>
            </table>
          </div>

          <div class="panel">
            <div class="panel-header">
              <span>${escapeHtml(hInfo.name)} (${escapeHtml(hInfo.abbr)})</span>
              <span style="font-size: 8px; color: #64748b;">${tr ? "Önde Gelenler" : "Top Projections"}</span>
            </div>
            <table class="data-table">
              <thead>
                <tr>
                  <th style="text-align: left;">${tr ? "Oyuncu" : "Player"}</th>
                  <th style="text-align: center;">${tr ? "Poz" : "Pos"}</th>
                  <th style="text-align: right;">PTS</th>
                  <th style="text-align: right;">REB</th>
                  <th style="text-align: right;">AST</th>
                </tr>
              </thead>
              <tbody>
                ${renderRosterRows(homePlayers)}
              </tbody>
            </table>
          </div>
        </div>

        <div class="section-title">
          <span>${tr ? "Resmi Sakatlık Raporu" : "Official Injury Report"}</span>
          ${injuryReport?.published_et ? `<span style="font-size: 8px; font-weight: 500; color: #475569; margin-left: 6px;">(${escapeHtml(reportStampText(injuryReport.published_et))})</span>` : ""}
        </div>
        <div class="columns-2">
          <div class="panel">
            <div class="panel-header">
              <span>${escapeHtml(aInfo.name)}</span>
              <span style="font-size: 8px; color: #64748b;">${awayInjuries.length} ${tr ? "Oyuncu" : "Listed"}</span>
            </div>
            <div>${renderInjuryList(awayInjuries, aInfo.name)}</div>
          </div>

          <div class="panel">
            <div class="panel-header">
              <span>${escapeHtml(hInfo.name)}</span>
              <span style="font-size: 8px; color: #64748b;">${homeInjuries.length} ${tr ? "Oyuncu" : "Listed"}</span>
            </div>
            <div>${renderInjuryList(homeInjuries, hInfo.name)}</div>
          </div>
        </div>

        <div class="footer">
          <div>${modelVer ? `Model: ${escapeHtml(modelVer)}` : "NBA Intelligence Lab"}</div>
          <div>${tr ? "NBA Intelligence Lab · Resmi NBA verileriyle oluşturulmuştur." : "NBA Intelligence Lab · Generated from official NBA data."}</div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          };
        </script>
      </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
}
