import { NBA_TEAMS, getTeamLogoUrl } from "./nbaTeams";

interface ExportPredictionReportArgs {
  result: any;
  date: string;
  fallbackHome: string;
  fallbackAway: string;
}

const getTeamInfo = (abbr: string) =>
  NBA_TEAMS.find((t) => t.abbr === abbr) || { abbr, name: abbr, color: "#1e293b" };

function formatPublishedTSI(publishedEt?: string | null): string {
  if (!publishedEt) return "";
  const m = publishedEt.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})\s+([AP]M)/i);
  if (!m) return publishedEt;
  const [, mon, day, yr, hh, mm, ap] = m;
  const fullYear = yr.length === 2 ? `20${yr}` : yr;
  let h = parseInt(hh, 10);
  if (ap.toUpperCase() === "PM" && h < 12) h += 12;
  if (ap.toUpperCase() === "AM" && h === 12) h = 0;
  // NBA Eastern time is typically UTC-4 (EDT) or UTC-5 (EST)
  // Converting via US Eastern timezone offset
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

export function exportPredictionAsPDF({
  result: resData,
  date: predDate,
  fallbackHome,
  fallbackAway,
}: ExportPredictionReportArgs) {
  if (!resData) return;

  const hInfo = getTeamInfo(resData.home_team || fallbackHome);
  const aInfo = getTeamInfo(resData.away_team || fallbackAway);
  const winnerAbbr = resData.win_probability?.predicted_winner || resData.predicted_winner;
  const winnerInfo = getTeamInfo(winnerAbbr);

  const homeProb = Number(resData.win_probability?.home_win_probability ?? 0.5);
  const awayProb = Number(resData.win_probability?.away_win_probability ?? 0.5);

  const predHomeScore = resData.score_prediction?.predicted_home_score?.toFixed(1) ?? "—";
  const predAwayScore = resData.score_prediction?.predicted_away_score?.toFixed(1) ?? "—";
  const predMargin = Math.abs(Number(resData.score_prediction?.predicted_margin ?? 0)).toFixed(1);
  const predTotal = Number(resData.score_prediction?.predicted_total_points ?? 0).toFixed(1);

  // Player projections
  const awayPlayers = (resData.player_predictions?.away_players || []).slice(0, 7);
  const homePlayers = (resData.player_predictions?.home_players || []).slice(0, 7);

  // Injury report players
  const injuryReport = resData.injury_report;
  const injuryPlayers: Array<{ team: string; player_name: string; status: string; reason?: string }> =
    injuryReport?.players || [];

  const awayInjuries = injuryPlayers.filter((p) => p.team === aInfo.abbr);
  const homeInjuries = injuryPlayers.filter((p) => p.team === hInfo.abbr);

  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  const getStatusBadge = (status: string) => {
    const s = (status || "").toLowerCase();
    if (s.includes("out")) {
      return '<span style="background: #fee2e2; color: #dc2626; padding: 2px 6px; border-radius: 4px; font-weight: 700; font-size: 9px; text-transform: uppercase;">OUT</span>';
    }
    if (s.includes("questionable") || s.includes("doubtful")) {
      return '<span style="background: #fef3c7; color: #d97706; padding: 2px 6px; border-radius: 4px; font-weight: 700; font-size: 9px; text-transform: uppercase;">QUESTIONABLE</span>';
    }
    return '<span style="background: #dcfce7; color: #16a34a; padding: 2px 6px; border-radius: 4px; font-weight: 700; font-size: 9px; text-transform: uppercase;">ACTIVE</span>';
  };

  const renderRosterRows = (players: any[]) => {
    if (!players || players.length === 0) {
      return '<tr><td colspan="5" style="text-align: center; color: #94a3b8; padding: 8px;">Projeksiyon bulunamadı</td></tr>';
    }
    return players
      .map(
        (p) => `
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 5px 6px; font-weight: 600; color: #0f172a; text-align: left;">${p.player_name}</td>
          <td style="padding: 5px 6px; text-align: center; color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 9px;">${p.position_group || "—"}</td>
          <td style="padding: 5px 6px; text-align: right; tabular-nums; font-weight: 600;">${Number(p.predicted_pts || 0).toFixed(1)}</td>
          <td style="padding: 5px 6px; text-align: right; tabular-nums; color: #475569;">${Number(p.predicted_reb || 0).toFixed(1)}</td>
          <td style="padding: 5px 6px; text-align: right; tabular-nums; color: #475569;">${Number(p.predicted_ast || 0).toFixed(1)}</td>
        </tr>
      `
      )
      .join("");
  };

  const renderInjuryList = (injuries: any[], teamName: string) => {
    if (!injuries || injuries.length === 0) {
      return `<div style="font-size: 10px; color: #64748b; font-style: italic; padding: 4px 0;">${teamName} için sakatlık bildirimi yok.</div>`;
    }
    return injuries
      .map(
        (inj) => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 4px 0; border-bottom: 1px dashed #f1f5f9; font-size: 10px;">
          <div style="display: flex; flex-direction: column; overflow: hidden; padding-right: 8px;">
            <span style="font-weight: 600; color: #0f172a;">${inj.player_name}</span>
            ${inj.reason ? `<span style="font-size: 8.5px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${inj.reason}</span>` : ""}
          </div>
          <div>${getStatusBadge(inj.status)}</div>
        </div>
      `
      )
      .join("");
  };

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>NBA Tahmin Raporu - ${aInfo.abbr} @ ${hInfo.abbr}</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
        <style>
          @page {
            size: A4 portrait;
            margin: 10mm 12mm 10mm 12mm;
          }
          * {
            box-sizing: border-box;
          }
          body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
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
            font-size: 17px;
            font-weight: 900;
            letter-spacing: -0.5px;
            text-transform: uppercase;
          }
          .title-area p {
            margin: 2px 0 0 0;
            font-size: 8.5px;
            color: #64748b;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .meta-pill {
            background: #f1f5f9;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 4px 10px;
            font-size: 9.5px;
            font-weight: 700;
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
            font-weight: 900;
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
            font-weight: 800;
            color: #0f172a;
            font-variant-numeric: tabular-nums;
          }
          .kpi-box-lbl {
            font-size: 8px;
            font-weight: 700;
            text-transform: uppercase;
            color: #64748b;
            margin-top: 1px;
            letter-spacing: 0.5px;
          }
          .section-title {
            font-size: 10px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.5px;
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
            font-weight: 800;
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
            font-weight: 700;
            font-size: 8px;
            text-transform: uppercase;
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
            color: #94a3b8;
          }
        </style>
      </head>
      <body>
        <!-- Header -->
        <div class="header">
          <div class="title-area">
            <h1>NBA Matchup Prediction Report</h1>
            <p>Official Predictive Model Output</p>
          </div>
          <div class="meta-pill">
            Tarih: ${predDate}
          </div>
        </div>

        <!-- Hero Matchup Card -->
        <div class="hero-card">
          <!-- Away Team -->
          <div class="team-box away">
            <img class="team-logo" src="${getTeamLogoUrl(aInfo.abbr)}" alt="${aInfo.name}" />
            <div>
              <div style="font-size: 12px; font-weight: 800; text-transform: uppercase;">${aInfo.name}</div>
              <div style="font-size: 8.5px; font-weight: 600; color: #64748b;">Deplasman · ${(awayProb * 100).toFixed(1)}% Galibiyet</div>
            </div>
            <div class="score-num" style="margin-left: 6px;">${predAwayScore}</div>
          </div>

          <!-- Divider -->
          <div class="score-center">
            <div style="font-size: 10px; font-weight: 800; color: #94a3b8; padding: 2px 7px; border: 1px solid #e2e8f0; border-radius: 10px; background: #fff;">VS</div>
          </div>

          <!-- Home Team -->
          <div class="team-box home">
            <div class="score-num" style="margin-right: 6px;">${predHomeScore}</div>
            <div>
              <div style="font-size: 12px; font-weight: 800; text-transform: uppercase;">${hInfo.name}</div>
              <div style="font-size: 8.5px; font-weight: 600; color: #64748b;">Ev Sahibi · ${(homeProb * 100).toFixed(1)}% Galibiyet</div>
            </div>
            <img class="team-logo" src="${getTeamLogoUrl(hInfo.abbr)}" alt="${hInfo.name}" />
          </div>
        </div>

        <!-- KPI Metrics Strip -->
        <div class="kpi-row">
          <div class="kpi-box">
            <div class="kpi-box-val" style="color: #10b981;">${winnerInfo.abbr} (%${(Math.max(homeProb, awayProb) * 100).toFixed(1)})</div>
            <div class="kpi-box-lbl">Tahmini Galip</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-box-val">${predMargin} Sayı</div>
            <div class="kpi-box-lbl">Beklenen Fark</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-box-val">${predTotal} Sayı</div>
            <div class="kpi-box-lbl">Beklenen Toplam Sayı</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-box-val">${predAwayScore} - ${predHomeScore}</div>
            <div class="kpi-box-lbl">Skor Tahmini</div>
          </div>
        </div>

        <!-- Section: Player Projections (Top 7 Players) -->
        <div class="section-title">Oyuncu Projeksiyonları</div>
        <div class="columns-2">
          <!-- Away Roster -->
          <div class="panel">
            <div class="panel-header">
              <span>${aInfo.name} (${aInfo.abbr})</span>
              <span style="font-size: 8px; color: #64748b;">En Yüksek Projeksiyonlar</span>
            </div>
            <table class="data-table">
              <thead>
                <tr>
                  <th style="text-align: left;">Oyuncu</th>
                  <th style="text-align: center;">Poz</th>
                  <th style="text-align: right;">Sayı</th>
                  <th style="text-align: right;">Rib</th>
                  <th style="text-align: right;">Ast</th>
                </tr>
              </thead>
              <tbody>
                ${renderRosterRows(awayPlayers)}
              </tbody>
            </table>
          </div>

          <!-- Home Roster -->
          <div class="panel">
            <div class="panel-header">
              <span>${hInfo.name} (${hInfo.abbr})</span>
              <span style="font-size: 8px; color: #64748b;">En Yüksek Projeksiyonlar</span>
            </div>
            <table class="data-table">
              <thead>
                <tr>
                  <th style="text-align: left;">Oyuncu</th>
                  <th style="text-align: center;">Poz</th>
                  <th style="text-align: right;">Sayı</th>
                  <th style="text-align: right;">Rib</th>
                  <th style="text-align: right;">Ast</th>
                </tr>
              </thead>
              <tbody>
                ${renderRosterRows(homePlayers)}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Section: Injury Report (Sakatlık Raporu) -->
        <div class="section-title">
          <span>Resmi Sakatlık Raporu</span>
          ${injuryReport?.published_et ? `<span style="font-size: 8px; font-weight: 600; color: #475569; margin-left: 6px;">(Rapor Saati: ${formatPublishedTSI(injuryReport.published_et)})</span>` : ""}
        </div>
        <div class="columns-2">
          <!-- Away Injuries -->
          <div class="panel">
            <div class="panel-header">
              <span>${aInfo.name} Durumu</span>
              <span style="font-size: 8px; color: #64748b;">${awayInjuries.length} Oyuncu</span>
            </div>
            <div>
              ${renderInjuryList(awayInjuries, aInfo.name)}
            </div>
          </div>

          <!-- Home Injuries -->
          <div class="panel">
            <div class="panel-header">
              <span>${hInfo.name} Durumu</span>
              <span style="font-size: 8px; color: #64748b;">${homeInjuries.length} Oyuncu</span>
            </div>
            <div>
              ${renderInjuryList(homeInjuries, hInfo.name)}
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="footer">
          <div>Model: ${resData.win_probability?.model_version ?? resData.score_prediction?.model_version ?? "v11 Production"}</div>
          <div>NBA Intelligence Predictive Platform · Resmi NBA verileriyle oluşturulmuştur.</div>
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
