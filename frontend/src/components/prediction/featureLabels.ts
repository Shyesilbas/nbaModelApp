import type { TeamInfo } from "./types";

export interface ExplanationContext {
  home_games_played?: number;
  away_games_played?: number;
  home_winrate_last_10?: number | null;
  away_winrate_last_10?: number | null;
  home_is_b2b?: boolean;
  away_is_b2b?: boolean;
  elo_blend_weight?: number;
}

export interface FormattedFeatureInfo {
  neutralBadge?: boolean;
  title: string;
  category: string;
  insight: string;
  simpleValue?: string;
  categoryIcon?: "trophy" | "zap" | "clock" | "home" | "target" | "shield" | "scale" | "activity";
}

const FORM_WINDOW = 10;

function formatRecord(winrate: number | null | undefined, games: number | undefined): string | null {
  if (winrate == null || !games) return null;
  const played = Math.min(games, FORM_WINDOW);
  const wins = Math.round(winrate * played);
  return `${wins}-${played - wins}`;
}

const fmtPct = (pct: string, tr: boolean) => (tr ? `%${pct}` : `${pct}%`);

export function formatFeatureInsight(
  featureKey: string,
  value: number,
  influence: string,
  homeInfo: TeamInfo,
  awayInfo: TeamInfo,
  ctx?: ExplanationContext,
  language: "tr" | "en" = "tr"
): FormattedFeatureInfo {
  const tr = language === "tr";
  const key = featureKey.toUpperCase();
  const favorsHome = influence === "FAVORS_HOME";
  const favoredTeam = favorsHome ? homeInfo : awayInfo;
  const minGames = ctx ? Math.min(ctx.home_games_played ?? 0, ctx.away_games_played ?? 0) : FORM_WINDOW;
  const formWindow = tr
    ? minGames > 0 && minGames < FORM_WINDOW
      ? `bu sezonki ${minGames} maçta`
      : "son maçlarında"
    : minGames > 0 && minGames < FORM_WINDOW
      ? `over their first ${minGames} games`
      : "in recent games";

  // 1. Score Model Margin
  if (key === "SCORE_PRED_MARGIN") {
    const marginAbs = Math.abs(value).toFixed(1);
    return {
      title: tr ? "Skor Modeli Öngörüsü" : "Score Model Projection",
      category: tr ? "Skor Tahmini" : "Score Projection",
      categoryIcon: "zap",
      simpleValue: tr ? `+${marginAbs} Sayı Fark` : `+${marginAbs} Pt Margin`,
      insight: tr
        ? `Skor tahmin modeli, ${favoredTeam.name} takımının maç sonunda rakibine yaklaşık ${marginAbs} sayı üstünlük kuracağını öngörüyor.`
        : `The score model projects ${favoredTeam.name} to finish with roughly a ${marginAbs}-point edge.`,
    };
  }

  // 2. Roster Availability & Rotation Context (v15)
  if (key === "ABS_DIFF") {
    const pts = Math.abs(value).toFixed(1);
    return {
      title: tr ? "Kadro Eksikliği Farkı" : "Roster Availability Edge",
      category: tr ? "Kadro & Güç" : "Roster & Strength",
      categoryIcon: "activity",
      simpleValue: tr ? `${pts} Puan Kadro Farkı` : `${pts} Availability Gap`,
      insight: tr
        ? `Mevcut sakatlık ve kadro raporuna göre ${favoredTeam.name} rakibine kıyasla rotasyon kaybından daha az etkileniyor.`
        : `Based on current availability, ${favoredTeam.name} carries less rotation disruption than the opponent.`,
    };
  }

  if (key === "ABS_DELTA" || key === "OPP_ABS_DELTA") {
    const subject = key.startsWith("OPP_") ? awayInfo : homeInfo;
    const pts = Math.abs(value).toFixed(1);
    return {
      title: `${subject.abbr} ${tr ? "Kadro Hücum Etkisi" : "Availability Impact"}`,
      category: tr ? "Kadro & Güç" : "Roster & Strength",
      categoryIcon: "activity",
      simpleValue: `${value >= 0 ? "+" : ""}${value.toFixed(1)} (${pts})`,
      insight: tr
        ? `${subject.name} kadrosundaki eksik veya kısıtlı oyuncuların hücum verimliliği üzerindeki tahmini net etkisi.`
        : `Estimated offensive efficiency adjustment from unavailable or restricted players for ${subject.name}.`,
    };
  }

  if (key === "MISSING_ROT_MINS_DIFF") {
    const mins = Math.abs(value).toFixed(1);
    return {
      title: tr ? "Eksik Rotasyon Dakikası" : "Missing Rotation Minutes",
      category: tr ? "Kadro & Güç" : "Roster & Strength",
      categoryIcon: "activity",
      simpleValue: tr ? `${mins} dk fark` : `${mins} min diff`,
      insight: tr
        ? `${favoredTeam.name}, sahada yer alamayan normal rotasyon oyuncularının dakika yükü bakımından rakibine göre daha avantajlı durumda.`
        : `${favoredTeam.name} loses fewer regular rotation minutes to absences compared with the opponent (${mins} min gap).`,
    };
  }

  if (key === "ROT_CONTINUITY_DIFF") {
    const gap = fmtPct((Math.abs(value) * 100).toFixed(1), tr);
    return {
      title: tr ? "Rotasyon Sürekliliği" : "Rotation Continuity",
      category: tr ? "Kadro & Güç" : "Roster & Strength",
      categoryIcon: "scale",
      simpleValue: tr ? `${gap} Uyum Farkı` : `${gap} Continuity`,
      insight: tr
        ? `${favoredTeam.name}, son dönemdeki alışılmış rotasyon çekirdeğini daha yüksek oranda koruyarak maça çıkıyor.`
        : `${favoredTeam.name} enters with greater continuity among players who shared recent rotation minutes.`,
    };
  }

  if (key === "ACTIVE_WT_GS_DIFF") {
    const gap = Math.abs(value).toFixed(2);
    return {
      title: tr ? "Aktif İlk Beş Deneyimi" : "Active Starter Continuity",
      category: tr ? "Kadro & Güç" : "Roster & Strength",
      categoryIcon: "trophy",
      simpleValue: `${gap}`,
      insight: tr
        ? `Sahaya çıkacak oyuncuların dakika ağırlıklı ilk beş başlangıç profili ${favoredTeam.name} lehine öne çıkıyor.`
        : `Minute-weighted starting experience among active players favors ${favoredTeam.name}.`,
    };
  }

  // 3. Elo & Strength
  if (key === "ELO_DIFF" || key === "ABS_ELO_DIFF") {
    const eloAbs = Math.abs(value).toFixed(0);
    const eloLevel = tr
      ? Math.abs(value) >= 100
        ? "belirgin şekilde"
        : Math.abs(value) >= 40
          ? "bir miktar"
          : "hafifçe"
      : Math.abs(value) >= 100
        ? "decisively"
        : Math.abs(value) >= 40
          ? "moderately"
          : "slightly";
    return {
      title: tr ? "Takım Güç Sıralaması (Elo)" : "Team Strength Rating (Elo)",
      category: tr ? "Kadro & Güç" : "Roster & Strength",
      categoryIcon: "trophy",
      simpleValue: `+${eloAbs} Elo`,
      insight: tr
        ? `${favoredTeam.name}, Elo güç sıralamasında rakibinin ${eloLevel} önünde yer alıyor.`
        : `${favoredTeam.name} ranks ${eloLevel} ahead in pre-game Elo strength.`,
    };
  }

  if (key === "PRE_GAME_ELO" || key === "OPP_PRE_GAME_ELO") {
    const isOpp = key.startsWith("OPP_");
    const team = isOpp ? awayInfo : homeInfo;
    return {
      title: isOpp
        ? tr
          ? "Deplasman Güç Seviyesi"
          : "Away Strength Rating"
        : tr
          ? "Ev Sahibi Güç Seviyesi"
          : "Home Strength Rating",
      category: tr ? "Kadro & Güç" : "Roster & Strength",
      categoryIcon: "trophy",
      simpleValue: `${value.toFixed(0)} Elo`,
      insight: tr
        ? `${team.name} takımının maç öncesi Elo güç puanı ${value.toFixed(0)} seviyesinde.`
        : `${team.name} enters with a pre-game Elo rating of ${value.toFixed(0)}.`,
    };
  }

  // 4. Venue & Home Court
  if (key === "IS_HOME") {
    return {
      title: tr ? "Saha ve Seyirci Desteği" : "Home Court Advantage",
      category: tr ? "Saha Avantajı" : "Venue & Schedule",
      categoryIcon: "home",
      simpleValue: tr ? "Ev Sahibi" : "Home Court",
      insight: tr
        ? `${homeInfo.name}, karşılaşmayı kendi taraftarı önünde oynamanın getirdiği saha avantajına sahip.`
        : `${homeInfo.name} benefits from playing on its home floor.`,
    };
  }

  if (key.includes("CURRENT_VENUE_WINRATE") || key.includes("HOME_WINRATE") || key.includes("AWAY_WINRATE")) {
    const pct = fmtPct((Math.abs(value) * 100).toFixed(0), tr);
    return {
      title: tr ? "Saha İçi Galibiyet Alışkanlığı" : "Venue Win-Rate Trend",
      category: tr ? "Saha Avantajı" : "Venue & Schedule",
      categoryIcon: "home",
      simpleValue: tr ? `${pct} Galibiyet` : `${pct} Win Rate`,
      insight: tr
        ? `${favoredTeam.name}, son iç/dış saha bölünmesinde daha yüksek bir galibiyet oranı yakaladı.`
        : `${favoredTeam.name} holds a stronger recent win rate in this venue split.`,
    };
  }

  if (key.includes("CURRENT_VENUE_PTS")) {
    return {
      title: tr ? "Salondaki Skor Dengesi" : "Venue Scoring Pace",
      category: tr ? "Saha Avantajı" : "Venue & Schedule",
      categoryIcon: "home",
      simpleValue: tr ? `${value.toFixed(1)} Sayı` : `${value.toFixed(1)} PTS`,
      insight: tr
        ? `${favoredTeam.name}, son maçlardaki salon içi skor üretiminde öne çıkıyor.`
        : `${favoredTeam.name} shows stronger recent scoring output in this setting.`,
    };
  }

  // 5. Rest & Schedule
  if (key === "DAYS_REST" || key === "OPP_DAYS_REST" || key === "REST_DIFF") {
    const days = Math.abs(value).toFixed(0);
    return {
      title: tr ? "Dinlenme Süresi Avantajı" : "Rest Advantage",
      category: tr ? "Fikstür & Kondisyon" : "Venue & Schedule",
      categoryIcon: "clock",
      simpleValue: tr ? `${days} Gün` : `${days}d Rest`,
      insight: tr
        ? `${favoredTeam.name}, maç takviminde dinlenme günü açısından daha elverişli bir konumda sahaya çıkıyor.`
        : `${favoredTeam.name} benefits from the rest schedule ahead of this matchup.`,
    };
  }

  if (key === "IS_B2B" || key === "OPP_IS_B2B") {
    const homeTired = ctx?.home_is_b2b ?? (key === "IS_B2B" && value === 1);
    const awayTired = ctx?.away_is_b2b ?? (key === "OPP_IS_B2B" && value === 1);
    const title = tr ? "Üst Üste Maç (Back-to-Back)" : "Back-to-Back Fatigue";
    const category = tr ? "Fikstür & Kondisyon" : "Venue & Schedule";

    if (homeTired && awayTired) {
      return {
        title,
        category,
        categoryIcon: "clock",
        neutralBadge: true,
        simpleValue: tr ? "İki takım da B2B" : "Both teams B2B",
        insight: tr
          ? `${homeInfo.name} ve ${awayInfo.name} dün gece de maç oynadı; yorgunluk açısından tek taraflı bir avantaj yok.`
          : `Both ${homeInfo.name} and ${awayInfo.name} played last night, keeping fatigue balanced.`,
      };
    }
    const tired = homeTired ? homeInfo : awayInfo;
    const rested = homeTired ? awayInfo : homeInfo;
    return {
      title,
      category,
      categoryIcon: "clock",
      simpleValue: tr ? `${tired.abbr} B2B` : `${tired.abbr} on B2B`,
      insight: tr
        ? `${tired.name} dün gece de oynadığı için yorgunluk yükü taşıyor; ${rested.name} dinlenmiş çıkıyor.`
        : `${tired.name} played last night on a back-to-back while ${rested.name} enters rested.`,
    };
  }

  // 6. Net Rating / Clean Net Rating / Off & Def Rating
  if (key.includes("CLEAN_NET_RTG_DIFF") || key.includes("NET_RTG_DIFF")) {
    const diff = Math.abs(value).toFixed(1);
    const isClean = key.includes("CLEAN");
    return {
      title: isClean
        ? tr
          ? "Düzeltilmiş Net Verimlilik Farkı"
          : "Clean Net Rating Differential"
        : tr
          ? "Son Dönem Net Verimlilik Farkı"
          : "Net Rating Differential",
      category: tr ? "Form & Ritim" : "Recent Form",
      categoryIcon: "activity",
      simpleValue: `+${diff} Net Rtg`,
      insight: tr
        ? `${favoredTeam.name}, ${formWindow} 100 pozisyon başına rakibinden ${Math.abs(value) >= 5 ? "belirgin şekilde " : ""}daha iyi bir net sayı farkı üretti.`
        : `${favoredTeam.name} holds a stronger per-100-possession efficiency margin ${formWindow}.`,
    };
  }

  if (key.includes("OFF_RTG_")) {
    const isOpp = key.startsWith("OPP_");
    const team = isOpp ? awayInfo : homeInfo;
    return {
      title: `${team.abbr} ${tr ? "Hücum Verimliliği" : "Offensive Rating"}`,
      category: tr ? "Form & Ritim" : "Recent Form",
      categoryIcon: "zap",
      simpleValue: `${value.toFixed(1)} ORTG`,
      insight: tr
        ? `${team.name} son maçlarda 100 pozisyonda ortalama ${value.toFixed(1)} sayı hücum verimliliği yakaladı.`
        : `${team.name} posts a recent offensive rating of ${value.toFixed(1)} points per 100 possessions.`,
    };
  }

  if (key.includes("DEF_RTG_")) {
    const isOpp = key.startsWith("OPP_");
    const team = isOpp ? awayInfo : homeInfo;
    return {
      title: `${team.abbr} ${tr ? "Savunma Verimliliği" : "Defensive Rating"}`,
      category: tr ? "Savunma & Direnç" : "Defense & Form",
      categoryIcon: "shield",
      simpleValue: `${value.toFixed(1)} DRTG`,
      insight: tr
        ? `${team.name} son maçlarda 100 pozisyonda ortalama ${value.toFixed(1)} sayı savunma puanı verdi.`
        : `${team.name} allows ${value.toFixed(1)} points per 100 possessions across its recent window.`,
    };
  }

  // 7. Shooting (eFG)
  if (key.includes("EFG_DIFF")) {
    const diff = fmtPct((Math.abs(value) * 100).toFixed(1), tr);
    return {
      title: tr ? "Efektif Şut Kalitesi (eFG%)" : "Effective FG% Edge",
      category: tr ? "Şut & Hücum" : "Shooting & Offense",
      categoryIcon: "target",
      simpleValue: `${diff}`,
      insight: tr
        ? `${favoredTeam.name}, son maçlarda üçlük ağırlıklı şut verimliliğinde rakibinin önünde yer alıyor.`
        : `${favoredTeam.name} holds a recent effective field-goal percentage edge.`,
    };
  }

  // 8. Win Rate
  if (key.includes("WINRATE_LAST_") || key.includes("WINRATE_DIFF")) {
    const homeWr = ctx?.home_winrate_last_10;
    const awayWr = ctx?.away_winrate_last_10;
    const homeRec = formatRecord(homeWr, ctx?.home_games_played);
    const awayRec = formatRecord(awayWr, ctx?.away_games_played);
    const early = minGames > 0 && minGames < FORM_WINDOW;
    const title = tr
      ? early
        ? "Sezon Başı Galibiyet Kaydı"
        : "Son 10 Maçtaki Galibiyet Kaydı"
      : early
        ? "Early-Season Win Record"
        : "Last 10 Games Record";

    if (homeRec && awayRec && homeWr != null && awayWr != null) {
      const better = homeWr > awayWr ? homeInfo : homeWr < awayWr ? awayInfo : null;
      const sample = early
        ? tr
          ? ` Örneklem henüz küçük (${ctx?.home_games_played} ve ${ctx?.away_games_played} maç).`
          : ` Sample is still small (${ctx?.home_games_played} vs ${ctx?.away_games_played} games).`
        : "";
      let reading: string;
      if (!better) {
        reading = tr ? "İki takımın son galibiyet kaydı eşit." : "Both teams share an identical record in this window.";
      } else if (better.abbr === favoredTeam.abbr) {
        reading = tr
          ? `Daha iyi kayıt ${better.name} tarafında ve model bunu onun lehine değerlendiriyor.`
          : `${better.name} holds the better record and receives the model edge here.`;
      } else {
        reading = tr
          ? `Daha iyi kayıt ${better.name} tarafında; ancak Elo ve net verimlilik benzer bilgiyi taşıdığı için katsayı ters dengeleme uyguluyor.`
          : `${better.name} holds the better raw record, while the model applies an offsetting weight alongside Elo and net rating.`;
      }
      return {
        title,
        category: tr ? "Form & Kayıt" : "Form & Record",
        categoryIcon: "activity",
        simpleValue: `${homeInfo.abbr} ${homeRec} · ${awayInfo.abbr} ${awayRec}`,
        insight: `${homeInfo.name} ${homeRec}, ${awayInfo.name} ${awayRec}. ${reading}${sample}`,
      };
    }

    const gap = fmtPct((Math.abs(value) * 100).toFixed(0), tr);
    return {
      title,
      category: tr ? "Form & Kayıt" : "Form & Record",
      categoryIcon: "activity",
      simpleValue: tr ? `${gap} Fark` : `${gap} Gap`,
      insight: tr
        ? `Son maç galibiyet oranındaki ${gap} fark modelde ${favoredTeam.name} lehine ağırlık taşıyor.`
        : `The ${gap} recent win-rate gap contributes toward ${favoredTeam.name}.`,
    };
  }

  // 9. Points Scored / Allowed
  if (key.includes("PTS_ALLOWED_LAST_")) {
    return {
      title: tr ? "Savunma Disiplini" : "Points Allowed Trend",
      category: tr ? "Savunma & Direnç" : "Defense & Resistance",
      categoryIcon: "shield",
      simpleValue: tr ? `${value.toFixed(1)} Yenen` : `${value.toFixed(1)} OPP PTS`,
      insight: tr
        ? `${favoredTeam.name}, son maçlarda potasında ${value.toFixed(1)} sayı ortalamasıyla daha sağlam bir savunma sergiledi.`
        : `${favoredTeam.name} allowed ${value.toFixed(1)} points per game over this stretch.`,
    };
  }

  if (key.includes("PTS_LAST_")) {
    return {
      title: tr ? "Skor Üretkenliği" : "Scoring Output",
      category: tr ? "Şut & Hücum" : "Scoring & Offense",
      categoryIcon: "target",
      simpleValue: tr ? `${value.toFixed(1)} Sayı` : `${value.toFixed(1)} PPG`,
      insight: tr
        ? `${favoredTeam.name} son karşılaşmalarda ${value.toFixed(1)} sayı ortalamasıyla yüksek hücum üretimi sağladı.`
        : `${favoredTeam.name} is averaging ${value.toFixed(1)} points in recent outings.`,
    };
  }

  // 10. Pace
  if (key.includes("PACE")) {
    const isOpp = key.startsWith("OPP_");
    const subject = key.includes("DIFF") || key.includes("COLLISION") ? favoredTeam : isOpp ? awayInfo : homeInfo;
    return {
      title: isOpp || !key.includes("DIFF")
        ? `${subject.abbr} ${tr ? "Maç Temposu" : "Game Pace"}`
        : tr
          ? "Maç Temposu Dengesi"
          : "Matchup Pace Dynamic",
      category: tr ? "Maç Temposu" : "Pace & Tempo",
      categoryIcon: "zap",
      simpleValue: tr ? `${value.toFixed(1)} Tempo` : `${value.toFixed(1)} Pace`,
      insight: tr
        ? `${subject.name} son maçlarda ortalama ${value.toFixed(1)} pozisyon temposuyla oynuyor.`
        : `${subject.name} plays at a recent pace of ${value.toFixed(1)} possessions per 48 minutes.`,
    };
  }

  // Fallback
  const cleanTitle = featureKey
    .replace(/^OPP_/, tr ? "Rakip " : "Opponent ")
    .replace(/^TEAM_/, "")
    .replace(/_LAST_\d+/, "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (l) => l.toUpperCase());

  return {
    title: cleanTitle,
    category: tr ? "Genel İstatistik" : "Model Feature",
    categoryIcon: "activity",
    simpleValue: typeof value === "number" ? value.toFixed(1) : String(value),
    insight: tr
      ? `Bu metrikteki dağılım model değerlendirmesinde ${favoredTeam.name} yönünde etki oluşturuyor.`
      : `This indicator contributes toward ${favoredTeam.name} in the model estimate.`,
  };
}
