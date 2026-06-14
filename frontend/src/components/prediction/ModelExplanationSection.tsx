import { useState } from "react";
import { Cpu, Info, Sparkles } from "lucide-react";
import type { TeamInfo } from "./types";

export function ModelExplanationSection({
  result,
  homeInfo,
  awayInfo,
}: {
  result: any;
  homeInfo: TeamInfo;
  awayInfo: TeamInfo;
}) {
  const [activeTab, setActiveTab] = useState<"win" | "score">("win");
  const expl = result.explanation;

  if (!expl) {
    return (
      <div className="surface rounded-[1.5rem] p-6 border border-slate-200/80 bg-white">
        <div className="flex items-center gap-3">
          <Info className="text-slate-400" size={16} />
          <p className="text-xs text-slate-500 font-semibold m-0">
            Explainable AI (XAI) details are not available for this prediction.
          </p>
        </div>
      </div>
    );
  }

  const winExpl = expl.win_probability;
  const scoreExpl = expl.score_prediction;

  // Filter features to get meaningful ones
  const winFeatures = (winExpl?.features || []).filter(
    (f: any) => Math.abs(f.contribution) > 0.0001
  );

  // Calculate total absolute contribution for percentage scaling
  const totalWinContrib = winFeatures.reduce((sum: number, f: any) => sum + Math.abs(f.contribution), 0) || 1;

  // Group win features by category
  const categories: { [key: string]: any[] } = {};
  winFeatures.forEach((f: any) => {
    if (!categories[f.category]) {
      categories[f.category] = [];
    }
    categories[f.category].push(f);
  });

  const winnerAbbr = result?.win_probability?.predicted_winner || result?.predicted_winner || (result?.win_probability?.home_win_prob >= 0.5 ? homeInfo.abbr : awayInfo.abbr);
  const winnerInfo = winnerAbbr === homeInfo.abbr ? homeInfo : awayInfo;

  const getReasonText = (f: any) => {
    const name = f.feature_name;
    const val = f.value;

    const isAwayFeature = name.startsWith("OPP_") || name.startsWith("AWAY_");
    const ownerTeam = isAwayFeature ? awayInfo : homeInfo;
    const otherTeam = isAwayFeature ? homeInfo : awayInfo;

    const favorsHome = f.influence === "FAVORS_HOME";
    const favorsAway = f.influence === "FAVORS_AWAY";
    const favorsTeam = favorsHome ? homeInfo : favorsAway ? awayInfo : null;

    if (name === "IS_HOME") {
      return `Home Court Advantage: Playing at home gives ${homeInfo.name} a strong environmental edge.`;
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
      return `Travel Factor: Less travel fatigue favors ${favorsTeam ? favorsTeam.name : homeInfo.name} (distance: ${val} miles).`;
    }

    const favorsText = favorsTeam ? `, favoring ${favorsTeam.name} (${favorsTeam.abbr})` : "";
    let cleanDisplayName = f.display_name || f.feature_name || "";
    if (cleanDisplayName.startsWith("Opponent ")) {
      cleanDisplayName = cleanDisplayName.replace("Opponent ", "");
    }
    return `${cleanDisplayName} for ${ownerTeam.name} (${ownerTeam.abbr}): ${val}${favorsText}, driving the model's prediction.`;
  };

  const top3 = winFeatures.slice(0, 3);
  const other2 = winFeatures.slice(3, 5);

  return (
    <div className="surface rounded-[1.5rem] p-5 lg:p-6 border border-slate-200 bg-white shadow-sm space-y-5">
      {/* ── TOP 5 REASONS EXPLAINER PANEL ── */}
      {winFeatures.length > 0 && (
        <div className="bg-gradient-to-br from-indigo-50/40 via-white to-indigo-50/10 border border-slate-200/80 rounded-2xl p-5 space-y-4 shadow-xs">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
            <Sparkles className="text-indigo-600 animate-pulse" size={16} />
            <div>
              <h5 className="text-[10px] font-black text-slate-800 uppercase tracking-wider m-0">
                Top 5 Prediction Drivers
              </h5>
              <p className="text-[9px] text-slate-400 font-semibold m-0 uppercase tracking-wide">
                Why the model selected {winnerInfo.name}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Top 3 Primary Drivers */}
            <div className="space-y-2.5">
              <span className="text-[8px] font-black text-indigo-600 uppercase tracking-widest block">
                Primary Drivers (Top 3 En Önemli Etken)
              </span>
              <div className="grid grid-cols-1 gap-2">
                {top3.map((f: any, i: number) => {
                  const favorsHome = f.influence === "FAVORS_HOME";
                  const favorsAway = f.influence === "FAVORS_AWAY";
                  const teamColor = favorsHome ? homeInfo.color : favorsAway ? awayInfo.color : "#64748b";
                  const teamAbbr = favorsHome ? homeInfo.abbr : favorsAway ? awayInfo.abbr : "NEUT";
                  const weightPct = ((Math.abs(f.contribution) / totalWinContrib) * 100).toFixed(1);
                  const isSupporting = (favorsHome && winnerAbbr === homeInfo.abbr) || (favorsAway && winnerAbbr === awayInfo.abbr);

                  return (
                    <div 
                      key={i} 
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-white border rounded-xl shadow-2xs hover:shadow-xs transition-shadow"
                      style={{ borderLeft: `4px solid ${teamColor}` }}
                    >
                      <div className="flex items-start gap-2.5">
                        <span 
                          className="flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-black text-white"
                          style={{ backgroundColor: teamColor }}
                        >
                          {i + 1}
                        </span>
                        <p className="text-xs text-slate-700 font-semibold leading-normal m-0 max-w-[500px]">
                          {getReasonText(f)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 self-end sm:self-auto">
                        <span 
                          className="text-[9px] font-black px-2 py-0.5 rounded font-mono uppercase tracking-wider"
                          style={{ backgroundColor: `${teamColor}15`, color: teamColor }}
                        >
                          Favors {teamAbbr}
                        </span>
                        <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded font-mono">
                          {isSupporting ? "+" : "-"}{weightPct}% Impact
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Next 2 Key Factors */}
            {other2.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-dashed border-slate-100">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block">
                  Supporting Factors (Diğer Önemli 2 Etken)
                </span>
                <div className="grid grid-cols-1 gap-2">
                  {other2.map((f: any, i: number) => {
                    const favorsHome = f.influence === "FAVORS_HOME";
                    const favorsAway = f.influence === "FAVORS_AWAY";
                    const teamColor = favorsHome ? homeInfo.color : favorsAway ? awayInfo.color : "#64748b";
                    const teamAbbr = favorsHome ? homeInfo.abbr : favorsAway ? awayInfo.abbr : "NEUT";
                    const weightPct = ((Math.abs(f.contribution) / totalWinContrib) * 100).toFixed(1);
                    const isSupporting = (favorsHome && winnerAbbr === homeInfo.abbr) || (favorsAway && winnerAbbr === awayInfo.abbr);

                    return (
                      <div 
                        key={i} 
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-slate-50/50 border border-slate-150 rounded-xl"
                      >
                        <div className="flex items-start gap-2.5">
                          <span className="flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold bg-slate-200 text-slate-600">
                            {i + 4}
                          </span>
                          <p className="text-xs text-slate-650 font-medium leading-normal m-0 max-w-[500px]">
                            {getReasonText(f)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 self-end sm:self-auto">
                          <span 
                            className="text-[8px] font-black px-1.5 py-0.5 rounded font-mono uppercase tracking-wider"
                            style={{ backgroundColor: `${teamColor}10`, color: teamColor }}
                          >
                            Favors {teamAbbr}
                          </span>
                          <span className="text-[8px] font-bold text-slate-400 bg-slate-100/80 px-1.5 py-0.5 rounded font-mono">
                            {isSupporting ? "+" : "-"}{weightPct}% Impact
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <Cpu className="text-indigo-600" size={16} />
          <div>
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider m-0">
              Explainable AI (XAI) Model Insights
            </h4>
            <p className="text-[10px] text-slate-400 font-semibold mt-0.5 uppercase tracking-wide">
              Shapley-based mathematical prediction drivers
            </p>
          </div>
        </div>

        <div className="flex border border-slate-200 bg-slate-50 p-0.5 rounded-xl w-fit gap-0.5">
          <button
            onClick={() => setActiveTab("win")}
            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all duration-200 ${
              activeTab === "win"
                ? "bg-white text-indigo-600 shadow-xs border border-slate-200/50"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Win Probability Drivers
          </button>
          <button
            onClick={() => setActiveTab("score")}
            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all duration-200 ${
              activeTab === "score"
                ? "bg-white text-indigo-600 shadow-xs border border-slate-200/50"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Expected Score Factors
          </button>
        </div>
      </div>

      {activeTab === "win" && (
        <div className="space-y-6 animate-fade-in">
          {/* Tug-of-war visualization */}
          <div className="space-y-3">
            <h5 className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
              Tug of War: Feature Contributions
            </h5>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {winFeatures.slice(0, 10).map((f: any, idx: number) => {
                const maxContrib = Math.max(...winFeatures.map((x: any) => Math.abs(x.contribution)), 0.1);
                const pct = Math.min(100, (Math.abs(f.contribution) / maxContrib) * 100);
                const isHomeFavored = f.contribution > 0;
                
                return (
                  <div key={idx} className="flex items-center gap-3 text-xs">
                    <div className="w-28 text-left font-bold text-slate-700 truncate" title={f.display_name}>
                      {f.display_name}
                    </div>
                    <div className="flex-1 h-5 bg-slate-100/80 rounded-full relative overflow-hidden flex items-center">
                      {isHomeFavored ? (
                        // Favor home (right of center)
                        <div className="absolute inset-y-0 left-1/2 flex items-center" style={{ width: "50%" }}>
                          <div 
                            className="h-full rounded-r-full transition-all duration-500" 
                            style={{ 
                              width: `${pct / 2}%`, 
                              backgroundColor: homeInfo.color 
                            }} 
                          />
                          <span className="text-[9px] font-bold ml-1.5" style={{ color: homeInfo.color }}>
                            +{f.contribution.toFixed(3)}
                          </span>
                        </div>
                      ) : (
                        // Favor away (left of center)
                        <div className="absolute inset-y-0 right-1/2 flex items-center justify-end" style={{ width: "50%" }}>
                          <span className="text-[9px] font-bold mr-1.5" style={{ color: awayInfo.color }}>
                            {f.contribution.toFixed(3)}
                          </span>
                          <div 
                            className="h-full rounded-l-full transition-all duration-500" 
                            style={{ 
                              width: `${pct / 2}%`, 
                              backgroundColor: awayInfo.color 
                            }} 
                          />
                        </div>
                      )}
                      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-300 z-10" />
                    </div>
                    <div className="w-12 text-right font-mono font-bold text-slate-400">
                      {f.value}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[8px] font-black text-slate-400 uppercase tracking-widest pt-1 border-t border-slate-100">
              <span style={{ color: awayInfo.color }}>Favors {awayInfo.abbr}</span>
              <span>Baseline Center</span>
              <span style={{ color: homeInfo.color }}>Favors {homeInfo.abbr}</span>
            </div>
          </div>

          {/* Categorized detailed cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.keys(categories).map((catName, idx) => (
              <div key={idx} className="bg-slate-50/50 border border-slate-200/60 rounded-2xl p-4 space-y-3">
                <h6 className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200/60 pb-1.5">
                  {catName}
                </h6>
                <div className="space-y-2">
                  {categories[catName].slice(0, 5).map((f: any, fIdx: number) => (
                    <div key={fIdx} className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-600 truncate max-w-[170px]" title={f.display_name}>
                        {f.display_name}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-700">{f.value}</span>
                        <span 
                          className="px-1.5 py-0.5 rounded font-mono font-black text-[9px]"
                          style={{
                            backgroundColor: f.influence === "FAVORS_HOME" ? `${homeInfo.color}15` : f.influence === "FAVORS_AWAY" ? `${awayInfo.color}15` : "#f1f5f9",
                            color: f.influence === "FAVORS_HOME" ? homeInfo.color : f.influence === "FAVORS_AWAY" ? awayInfo.color : "#64748b"
                          }}
                        >
                          {f.influence === "FAVORS_HOME" ? homeInfo.abbr : f.influence === "FAVORS_AWAY" ? awayInfo.abbr : "NEUT"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "score" && (
        <div className="space-y-5 animate-fade-in">
          {/* Pace and offensive rating sliders */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Pace Adjustments */}
            <div className="space-y-3 border border-slate-200/60 rounded-2xl p-4 bg-slate-50/50">
              <div className="flex justify-between items-center border-b border-slate-200/60 pb-1.5">
                <h6 className="text-[9px] font-black text-slate-400 uppercase tracking-widest m-0">
                  Game Pace Drivers
                </h6>
                <span className="text-[10px] font-mono font-black text-indigo-600">
                  Total Pace
                </span>
              </div>
              <div className="space-y-2.5">
                {(scoreExpl?.pace_features || []).slice(0, 6).map((f: any, idx: number) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-[11px] font-semibold text-slate-600">
                      <span>{f.display_name}</span>
                      <span className="font-mono font-bold" style={{ color: f.contribution >= 0 ? "#10b981" : "#ef4444" }}>
                        {f.contribution >= 0 ? `+${f.contribution.toFixed(2)}` : f.contribution.toFixed(2)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-200/80 rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all duration-300"
                        style={{ 
                          width: `${Math.min(100, Math.abs(f.contribution) * 15)}%`,
                          backgroundColor: f.contribution >= 0 ? "#10b981" : "#ef4444",
                          marginLeft: f.contribution < 0 ? "auto" : "0"
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Margin Adjustments */}
            <div className="space-y-3 border border-slate-200/60 rounded-2xl p-4 bg-slate-50/50">
              <div className="flex justify-between items-center border-b border-slate-200/60 pb-1.5">
                <h6 className="text-[9px] font-black text-slate-400 uppercase tracking-widest m-0">
                  Score Margin Drivers
                </h6>
                <span className="text-[10px] font-mono font-black text-indigo-600">
                  Margin Adjustment
                </span>
              </div>
              <div className="space-y-2.5">
                {(scoreExpl?.margin_features || []).slice(0, 6).map((f: any, idx: number) => {
                  const favorsHome = f.contribution > 0;
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-[11px] font-semibold text-slate-600">
                        <span>{f.display_name}</span>
                        <span className="font-mono font-bold" style={{ color: favorsHome ? homeInfo.color : awayInfo.color }}>
                          {favorsHome ? `+${f.contribution.toFixed(1)} ${homeInfo.abbr}` : `${f.contribution.toFixed(1)} ${awayInfo.abbr}`}
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-200/80 rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full transition-all duration-300"
                          style={{ 
                            width: `${Math.min(100, Math.abs(f.contribution) * 8)}%`,
                            backgroundColor: favorsHome ? homeInfo.color : awayInfo.color,
                            marginLeft: !favorsHome ? "auto" : "0"
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Offensive Rating Splits */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Home Offensive Rating */}
            <div className="space-y-3 border border-slate-200/60 rounded-2xl p-4 bg-slate-50/50">
              <h6 className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200/60 pb-1.5" style={{ color: homeInfo.color }}>
                {homeInfo.abbr} Offensive Rating Drivers
              </h6>
              <div className="space-y-2.5">
                {(scoreExpl?.home_rtg_features || []).slice(0, 5).map((f: any, idx: number) => (
                  <div key={idx} className="flex justify-between items-center text-[11px]">
                    <span className="font-semibold text-slate-600 truncate max-w-[200px]" title={f.display_name}>
                      {f.display_name}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-700">{f.value}</span>
                      <span 
                        className="font-mono font-black px-1.5 py-0.5 rounded text-[9px]"
                        style={{
                          backgroundColor: f.contribution >= 0 ? "#d1fae5" : "#fee2e2",
                          color: f.contribution >= 0 ? "#065f46" : "#991b1b"
                        }}
                      >
                        {f.contribution >= 0 ? `+${f.contribution.toFixed(1)}` : f.contribution.toFixed(1)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Away Offensive Rating */}
            <div className="space-y-3 border border-slate-200/60 rounded-2xl p-4 bg-slate-50/50">
              <h6 className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200/60 pb-1.5" style={{ color: awayInfo.color }}>
                {awayInfo.abbr} Offensive Rating Drivers
              </h6>
              <div className="space-y-2.5">
                {(scoreExpl?.away_rtg_features || []).slice(0, 5).map((f: any, idx: number) => (
                  <div key={idx} className="flex justify-between items-center text-[11px]">
                    <span className="font-semibold text-slate-600 truncate max-w-[200px]" title={f.display_name}>
                      {f.display_name}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-700">{f.value}</span>
                      <span 
                        className="font-mono font-black px-1.5 py-0.5 rounded text-[9px]"
                        style={{
                          backgroundColor: f.contribution >= 0 ? "#d1fae5" : "#fee2e2",
                          color: f.contribution >= 0 ? "#065f46" : "#991b1b"
                        }}
                      >
                        {f.contribution >= 0 ? `+${f.contribution.toFixed(1)}` : f.contribution.toFixed(1)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
