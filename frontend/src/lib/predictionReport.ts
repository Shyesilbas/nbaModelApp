import { NBA_TEAMS, getTeamLogoUrl } from "./nbaTeams";

interface ExportPredictionReportArgs {
  result: any;
  date: string;
  fallbackHome: string;
  fallbackAway: string;
}

const getTeamInfo = (abbr: string) =>
  NBA_TEAMS.find((t) => t.abbr === abbr) || { abbr, name: abbr, color: "#475569" };

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
  const winProb = Math.max(resData.win_probability?.home_win_probability ?? 0, resData.win_probability?.away_win_probability ?? 0);
  const confidence = resData.win_probability?.confidence_bucket || "MEDIUM";
  const margin = resData.score_prediction?.predicted_margin ?? 0;
  const total = resData.score_prediction?.predicted_total_points ?? 0;

  const expl = resData.explanation;
  const winExpl = expl?.win_probability;
  const winFeatures = (winExpl?.features || []).filter(
    (f: any) => Math.abs(f.contribution) > 0.0001
  );

  // Calculate total absolute contribution for percentage scaling
  const totalWinContrib = winFeatures.reduce((sum: number, f: any) => sum + Math.abs(f.contribution), 0) || 1;
  const top3 = winFeatures.slice(0, 3);
  const other2 = winFeatures.slice(3, 5);

  const getReasonText = (f: any) => {
    const name = f.feature_name;
    const val = f.value;

    const isAwayFeature = name.startsWith("OPP_") || name.startsWith("AWAY_");
    const ownerTeam = isAwayFeature ? aInfo : hInfo;
    const otherTeam = isAwayFeature ? hInfo : aInfo;

    const favorsHome = f.influence === "FAVORS_HOME";
    const favorsAway = f.influence === "FAVORS_AWAY";
    const favorsTeam = favorsHome ? hInfo : favorsAway ? aInfo : null;

    if (name === "IS_HOME") {
      return `Home Court Advantage: Playing at home gives ${hInfo.name} a strong environmental edge.`;
    }
    if (name === "DAYS_REST" || name === "OPP_DAYS_REST") {
      return `Rest Advantage: ${ownerTeam.name} has a recovery edge with ${val} days of rest.`;
    }
    if (name === "IS_B2B" || name === "OPP_IS_B2B") {
      return val === 1
        ? `Fatigue Factor: ${ownerTeam.name} is playing on a back-to-back, creating a physical stamina disadvantage.`
        : `Schedule Advantage: ${ownerTeam.name} avoided back-to-back fatigue, entering the matchup fresher.`;
    }
    if (name.includes("WINRATE_LAST_")) {
      const games = name.split("_").pop();
      if (name.includes("HOME_")) {
        return `Home Splits Win Rate: ${ownerTeam.name} (${ownerTeam.abbr}) won ${(val * 100).toFixed(0)}% of their last 5 home games.`;
      }
      if (name.includes("AWAY_")) {
        return `Away Splits Win Rate: ${ownerTeam.name} (${ownerTeam.abbr}) won ${(val * 100).toFixed(0)}% of their last 5 road games.`;
      }
      return `Recent Momentum: ${ownerTeam.name} (${ownerTeam.abbr}) won ${(val * 100).toFixed(0)}% of their last ${games} games.`;
    }
    if (name.includes("PTS_ALLOWED_LAST_")) {
      const games = name.split("_").pop();
      if (name.includes("HOME_")) {
        return `Home Splits Defense: ${ownerTeam.name} (${ownerTeam.abbr}) allowed an average of ${val} points at home in their last 5 home games.`;
      }
      if (name.includes("AWAY_")) {
        return `Away Splits Defense: ${ownerTeam.name} (${ownerTeam.abbr}) allowed an average of ${val} points on the road in their last 5 away games.`;
      }
      return `Overall Defense: ${ownerTeam.name} (${ownerTeam.abbr}) allowed an average of ${val} points in their last ${games} games.`;
    }
    if (name.includes("PTS_LAST_")) {
      const games = name.split("_").pop();
      if (name.includes("HOME_")) {
        return `Home Splits Offense: ${ownerTeam.name} (${ownerTeam.abbr}) scored an average of ${val} points at home in their last 5 home games.`;
      }
      if (name.includes("AWAY_")) {
        return `Away Splits Offense: ${ownerTeam.name} (${ownerTeam.abbr}) scored an average of ${val} points on the road in their last 5 away games.`;
      }
      return `Recent Offense: ${ownerTeam.name} (${ownerTeam.abbr}) scored an average of ${val} points in their last ${games} games.`;
    }
    if (name.includes("PROJ_PTS_SUM")) {
      return `Roster Firepower: Projections forecast high-scoring active players (${val} points) for ${ownerTeam.name} (${ownerTeam.abbr}).`;
    }
    if (name.includes("PROJ_PRA_SUM")) {
      return `All-Around Depth: Combined projected Points, Rebounds, and Assists (${val} PRA) favor ${ownerTeam.name} (${ownerTeam.abbr}).`;
    }
    if (name.includes("OFF_RTG_LAST_")) {
      const games = name.split("_").pop();
      return `Offensive Efficiency: ${ownerTeam.name} (${ownerTeam.abbr}) boasts a rating of ${val} points per 100 possessions (last ${games} games).`;
    }
    if (name.includes("DEF_RTG_LAST_")) {
      const games = name.split("_").pop();
      return `Defensive Strength: ${ownerTeam.name} (${ownerTeam.abbr}) locked down opponents with a defensive rating of ${val} (last ${games} games).`;
    }
    if (name.includes("H2H_WINRATE")) {
      return `Head-to-Head History: ${ownerTeam.name} holds a matchup edge, winning ${(val * 100).toFixed(0)}% of recent meetings against ${otherTeam.abbr}.`;
    }
    if (name === "TRAVEL_DISTANCE") {
      return `Travel Factor: Less travel fatigue favors ${favorsTeam ? favorsTeam.name : hInfo.name} (distance: ${val} miles).`;
    }

    const favorsText = favorsTeam ? `, favoring ${favorsTeam.name} (${favorsTeam.abbr})` : "";
    let cleanDisplayName = f.display_name || f.feature_name || "";
    if (cleanDisplayName.startsWith("Opponent ")) {
      cleanDisplayName = cleanDisplayName.replace("Opponent ", "");
    }
    return `${cleanDisplayName} for ${ownerTeam.name} (${ownerTeam.abbr}): ${val}${favorsText}, driving the model's prediction.`;
  };

  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  const html = `
    <html>
      <head>
        <title>NBA Prediction Report - ${aInfo.abbr} @ ${hInfo.abbr}</title>
        <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;900&family=Inter:wght@400;600;800;900&display=swap" rel="stylesheet">
        <style>
          body {
            font-family: 'Inter', sans-serif;
            color: #1e293b;
            background-color: #ffffff;
            margin: 0;
            padding: 30px;
            font-size: 11px;
            line-height: 1.4;
          }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
          .header {
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 12px;
            margin-bottom: 18px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .title {
            font-family: 'Barlow Condensed', sans-serif;
            font-size: 24px;
            font-weight: 900;
            text-transform: uppercase;
            color: #0f172a;
            margin: 0;
            letter-spacing: -0.5px;
          }
          .subtitle {
            font-size: 9px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 2px;
            color: #64748b;
            margin-top: 3px;
          }
          .meta-date {
            font-family: monospace;
            font-size: 11px;
            font-weight: bold;
            color: #64748b;
          }
          .matchup-hero {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 18px;
            display: grid;
            grid-template-columns: 1fr auto 1fr;
            align-items: center;
            gap: 15px;
          }
          .team-row {
            display: flex;
            align-items: center;
            gap: 12px;
          }
          .team-row.away {
            justify-content: flex-start;
            text-align: left;
          }
          .team-row.home {
            justify-content: flex-end;
            text-align: right;
          }
          .team-logo {
            width: 40px;
            height: 40px;
            object-fit: contain;
          }
          .team-meta {
            display: flex;
            flex-direction: column;
            flex-grow: 1;
            min-width: 0;
          }
          .team-name {
            font-family: 'Barlow Condensed', sans-serif;
            font-size: 18px;
            font-weight: 900;
            text-transform: uppercase;
            color: #0f172a;
            margin: 0;
          }
          .team-sub {
            font-size: 8px;
            font-weight: 800;
            color: #64748b;
            text-transform: uppercase;
            margin-top: 1px;
            letter-spacing: 0.5px;
          }
          .team-score {
            font-family: 'Barlow Condensed', sans-serif;
            font-size: 30px;
            font-weight: 900;
            line-height: 1;
          }
          .vs-divider {
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .vs-text {
            font-family: 'Barlow Condensed', sans-serif;
            font-size: 11px;
            font-weight: 900;
            color: #94a3b8;
            padding: 4px 8px;
            border: 1px dashed #cbd5e1;
            border-radius: 50%;
            background: #ffffff;
          }
          .win-banner {
            grid-column: 1 / span 3;
            margin-top: 10px;
            background: #f0fdf4;
            border: 1px solid #bbf7d0;
            padding: 6px;
            border-radius: 6px;
            color: #15803d;
            font-size: 10px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 1px;
            text-align: center;
          }
          .grid-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            margin-bottom: 18px;
          }
          .card {
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 14px;
            background: #ffffff;
          }
          .card-title {
            font-size: 9px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            color: #64748b;
            margin-bottom: 10px;
            border-bottom: 1px solid #f1f5f9;
            padding-bottom: 5px;
          }
          .kpi-row {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
          }
          .kpi-box {
            background: #f8fafc;
            border: 1px solid #f1f5f9;
            padding: 8px;
            border-radius: 6px;
            text-align: center;
          }
          .kpi-value {
            font-size: 14px;
            font-weight: 900;
            font-family: monospace;
            color: #0f172a;
          }
          .kpi-label {
            font-size: 7.5px;
            font-weight: 800;
            color: #64748b;
            text-transform: uppercase;
            margin-top: 1px;
          }
          .narrative-text {
            font-size: 11px;
            color: #334155;
            line-height: 1.5;
            margin: 0;
            font-weight: 500;
            text-align: left;
          }
          .page-break {
            page-break-before: always;
          }
          .roster-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 9.5px;
            margin-top: 6px;
          }
          .roster-table th {
            background: #f8fafc;
            color: #475569;
            font-weight: 800;
            text-transform: uppercase;
            font-size: 8px;
            letter-spacing: 1px;
            padding: 5px 6px;
            border-bottom: 1px solid #cbd5e1;
            text-align: right;
          }
          .roster-table th:first-child { text-align: left; }
          .roster-table td {
            padding: 5px 6px;
            border-bottom: 1px solid #f1f5f9;
            text-align: right;
          }
          .roster-table td:first-child {
            text-align: left;
            font-weight: bold;
            color: #1e293b;
          }
          .roster-table tr:hover { background: #f8fafc; }
          .footer-section {
            margin-top: 30px;
            padding-top: 12px;
            border-top: 1px solid #e2e8f0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 8px;
            color: #94a3b8;
          }
          .xai-section {
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 14px;
            margin-bottom: 18px;
            background: #ffffff;
          }
          .xai-driver-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 10px;
            background: #f8fafc;
            border-radius: 8px;
            border: 1px solid #f1f5f9;
            margin-bottom: 6px;
          }
          .xai-driver-item:last-child {
            margin-bottom: 0;
          }
          .xai-driver-left {
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .xai-driver-num {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            color: #ffffff;
            font-size: 9px;
            font-weight: bold;
          }
          .xai-driver-text {
            font-size: 11px;
            font-weight: 500;
            color: #334155;
          }
          .xai-driver-right {
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .xai-badge {
            font-size: 8px;
            font-weight: 850;
            padding: 2px 6px;
            border-radius: 4px;
            text-transform: uppercase;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="title">NBA Prediction Report</h1>
            <div class="subtitle">Powered by Antigravity Predictive Engine</div>
          </div>
          <div class="meta-date">Date: ${predDate}</div>
        </div>

        <div class="matchup-hero">
          <div class="team-row away">
            <img class="team-logo" src="${getTeamLogoUrl(aInfo.abbr)}" alt="${aInfo.name}" />
            <div class="team-meta">
              <div class="team-name">${aInfo.name}</div>
              <div class="team-sub">Away · ${(resData.win_probability?.away_win_probability * 100).toFixed(1)}% Win Prob</div>
            </div>
            <div class="team-score" style="color: ${aInfo.color};">${resData.score_prediction?.predicted_away_score?.toFixed(1)}</div>
          </div>

          <div class="vs-divider">
            <div class="vs-text">VS</div>
          </div>

          <div class="team-row home">
            <div class="team-score" style="color: ${hInfo.color};">${resData.score_prediction?.predicted_home_score?.toFixed(1)}</div>
            <div class="team-meta">
              <div class="team-name">${hInfo.name}</div>
              <div class="team-sub">Home · ${(resData.win_probability?.home_win_probability * 100).toFixed(1)}% Win Prob</div>
            </div>
            <img class="team-logo" src="${getTeamLogoUrl(hInfo.abbr)}" alt="${hInfo.name}" />
          </div>

          <div class="win-banner">
            Projected Winner: ${winnerInfo.name} (${confidence} Confidence)
          </div>
        </div>

        <div class="grid-2">
          <div class="card">
            <div class="card-title">Score Predictions</div>
            <div class="kpi-row">
              <div class="kpi-box">
                <div class="kpi-value">${resData.score_prediction?.predicted_away_score?.toFixed(1)}</div>
                <div class="kpi-label">${aInfo.abbr} Expected</div>
              </div>
              <div class="kpi-box">
                <div class="kpi-value">${resData.score_prediction?.predicted_home_score?.toFixed(1)}</div>
                <div class="kpi-label">${hInfo.abbr} Expected</div>
              </div>
              <div class="kpi-box">
                <div class="kpi-value">${Math.abs(margin).toFixed(1)} pts</div>
                <div class="kpi-label">Expected Margin (${winnerInfo.abbr})</div>
              </div>
              <div class="kpi-box">
                <div class="kpi-value">${total?.toFixed(1)} pts</div>
                <div class="kpi-label">Expected Total</div>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-title">Matchup Analysis</div>
            <p class="narrative-text">
              The model projects ${winnerInfo.name} to control this matchup, assigning a ${(winProb * 100).toFixed(1)}% win probability. 
              The expected winning margin of ${Math.abs(margin).toFixed(1)} points suggests ${winnerInfo.abbr} maintains a meaningful edge throughout. 
              Offensive efficiency, squad rosters, and home court factors contribute significantly to the forecast.
            </p>
          </div>
        </div>

        ${expl && winFeatures.length > 0 ? `
          <div class="xai-section">
            <div class="card-title">Model Prediction Drivers (Explainable AI)</div>
            <div style="display: flex; flex-direction: column; gap: 6px;">
              ${top3.map((f: any, idx: number) => {
                const favorsHome = f.influence === "FAVORS_HOME";
                const favorsAway = f.influence === "FAVORS_AWAY";
                const teamColor = favorsHome ? hInfo.color : favorsAway ? aInfo.color : "#64748b";
                const teamAbbr = favorsHome ? hInfo.abbr : favorsAway ? aInfo.abbr : "NEUT";
                const weightPct = ((Math.abs(f.contribution) / totalWinContrib) * 100).toFixed(1);
                const isSupporting = (favorsHome && winnerAbbr === hInfo.abbr) || (favorsAway && winnerAbbr === aInfo.abbr);
                
                return `
                  <div class="xai-driver-item" style="border-left: 4px solid ${teamColor};">
                    <div class="xai-driver-left">
                      <div class="xai-driver-num" style="background: ${teamColor};">${idx + 1}</div>
                      <div class="xai-driver-text">${getReasonText(f)}</div>
                    </div>
                    <div class="xai-driver-right">
                      <span class="xai-badge" style="background: ${teamColor}15; color: ${teamColor};">Favors ${teamAbbr}</span>
                      <span class="xai-badge" style="background: #f1f5f9; color: #475569;">${isSupporting ? "+" : "-"}${weightPct}% Impact</span>
                    </div>
                  </div>
                `;
              }).join("")}
              ${other2.map((f: any, idx: number) => {
                const favorsHome = f.influence === "FAVORS_HOME";
                const favorsAway = f.influence === "FAVORS_AWAY";
                const teamColor = favorsHome ? hInfo.color : favorsAway ? aInfo.color : "#64748b";
                const teamAbbr = favorsHome ? hInfo.abbr : favorsAway ? aInfo.abbr : "NEUT";
                const weightPct = ((Math.abs(f.contribution) / totalWinContrib) * 100).toFixed(1);
                const isSupporting = (favorsHome && winnerAbbr === hInfo.abbr) || (favorsAway && winnerAbbr === aInfo.abbr);

                return `
                  <div class="xai-driver-item" style="background: #ffffff; border: 1px solid #f1f5f9;">
                    <div class="xai-driver-left">
                      <div class="xai-driver-num" style="background: #94a3b8;">${idx + 4}</div>
                      <div class="xai-driver-text" style="color: #475569;">${getReasonText(f)}</div>
                    </div>
                    <div class="xai-driver-right">
                      <span class="xai-badge" style="background: ${teamColor}10; color: ${teamColor};">Favors ${teamAbbr}</span>
                      <span class="xai-badge" style="background: #f1f5f9; color: #64748b;">${isSupporting ? "+" : "-"}${weightPct}% Impact</span>
                    </div>
                  </div>
                `;
              }).join("")}
            </div>
          </div>
        ` : ""}

        <div class="page-break"></div>

        <div class="header">
          <div>
            <h1 class="title">Roster Projections</h1>
            <div class="subtitle">${aInfo.abbr} vs ${hInfo.abbr} Player Details</div>
          </div>
        </div>

        <div class="grid-2">
          <div class="card">
            <div class="card-title">${aInfo.name} Projections</div>
            <table class="roster-table">
              <thead>
                <tr>
                  <th style="text-align: left;">Player</th>
                  <th>Pos</th>
                  <th>PTS</th>
                  <th>REB</th>
                  <th>AST</th>
                  <th>PRA</th>
                </tr>
              </thead>
              <tbody>
                ${resData.player_predictions?.away_players?.map((p: any) => `
                  <tr>
                    <td style="text-align: left;">${p.player_name}</td>
                    <td style="text-align: right; color: #64748b; font-weight: bold; text-transform: uppercase;">${p.position_group}</td>
                    <td>${p.predicted_pts.toFixed(1)}</td>
                    <td>${p.predicted_reb.toFixed(1)}</td>
                    <td>${p.predicted_ast.toFixed(1)}</td>
                    <td style="font-weight: bold; color: #0f172a;">${p.predicted_pra.toFixed(1)}</td>
                  </tr>
                `).join("") || "<tr><td colspan='6'>No projections</td></tr>"}
              </tbody>
            </table>
          </div>

          <div class="card">
            <div class="card-title">${hInfo.name} Projections</div>
            <table class="roster-table">
              <thead>
                <tr>
                  <th style="text-align: left;">Player</th>
                  <th>Pos</th>
                  <th>PTS</th>
                  <th>REB</th>
                  <th>AST</th>
                  <th>PRA</th>
                </tr>
              </thead>
              <tbody>
                ${resData.player_predictions?.home_players?.map((p: any) => `
                  <tr>
                    <td style="text-align: left;">${p.player_name}</td>
                    <td style="text-align: right; color: #64748b; font-weight: bold; text-transform: uppercase;">${p.position_group}</td>
                    <td>${p.predicted_pts.toFixed(1)}</td>
                    <td>${p.predicted_reb.toFixed(1)}</td>
                    <td>${p.predicted_ast.toFixed(1)}</td>
                    <td style="font-weight: bold; color: #0f172a;">${p.predicted_pra.toFixed(1)}</td>
                  </tr>
                `).join("") || "<tr><td colspan='6'>No projections</td></tr>"}
              </tbody>
            </table>
          </div>
        </div>

        <div class="footer-section">
          <div>Model: ${resData.win_probability?.model_version ?? resData.score_prediction?.model_version ?? '—'}</div>
          <div>Report generated automatically. All predictions are statistical estimates.</div>
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
