import type { TeamInfo } from "./types";

export interface FormattedFeatureInfo {
  title: string;
  category: string;
  insight: string;
}

export function formatFeatureInsight(
  featureKey: string,
  value: number,
  influence: string,
  homeInfo: TeamInfo,
  awayInfo: TeamInfo
): FormattedFeatureInfo {
  const key = featureKey.toUpperCase();
  const favorsHome = influence === "FAVORS_HOME";
  const favoredTeam = favorsHome ? homeInfo : awayInfo;


  // 1. Core Model & Power Metrics
  if (key === "SCORE_PRED_MARGIN") {
    const marginAbs = Math.abs(value).toFixed(1);
    return {
      title: "Skor Modeli Üstünlüğü",
      category: "Temel Güç",
      insight: `Skor modelleri ${favoredTeam.name} (${favoredTeam.abbr}) için ${marginAbs} sayılık net bir skor üstünlüğü öngörüyor.`,
    };
  }

  if (key === "ELO_DIFF" || key === "ABS_ELO_DIFF") {
    const eloAbs = Math.abs(value).toFixed(0);
    return {
      title: "Elo Güç Reytingi Farkı",
      category: "Temel Güç",
      insight: `${favoredTeam.name}, rakibine karşı ${eloAbs} puanlık Elo reytingi üstünlüğüyle maça favori giriyor.`,
    };
  }

  if (key === "PRE_GAME_ELO") {
    return {
      title: "Ev Sahibi Elo Reytingi",
      category: "Temel Güç",
      insight: `${homeInfo.name} ${value.toFixed(0)} Elo puanı ile lig ortalamasının üzerinde bir güç profili sunuyor.`,
    };
  }

  if (key === "OPP_PRE_GAME_ELO") {
    return {
      title: "Deplasman Elo Reytingi",
      category: "Temel Güç",
      insight: `${awayInfo.name} ${value.toFixed(0)} Elo puanı ile deplasmanda mücadele ediyor.`,
    };
  }

  // 2. Efficiency & Net Rating
  if (key.includes("NET_RTG_DIFF")) {
    const diff = Math.abs(value).toFixed(1);
    return {
      title: "Net Verimlilik (Net Rating) Farkı",
      category: "Verimlilik",
      insight: `Son 10 maçta ${favoredTeam.name}, 100 pozisyon başına +${diff} sayı net verimlilik farkıyla çok daha üstün bir form sergiledi.`,
    };
  }

  if (key.includes("EFG_DIFF")) {
    const diff = (Math.abs(value) * 100).toFixed(1);
    return {
      title: "Efektif Şut Yüzdesi (eFG%) Farkı",
      category: "Verimlilik",
      insight: `${favoredTeam.name}, şut kalitesi ve efektif isabette rakibine %${diff} oranında üstünlük sağlıyor.`,
    };
  }

  // 3. Shooting Distribution & Regression
  if (key.includes("PTS_SHARE_3PT")) {
    const pct = (value * 100).toFixed(0);
    const owner = key.startsWith("OPP_") ? awayInfo : homeInfo;
    return {
      title: "3 Sayılık Skor Payı",
      category: "Şut & Taktik",
      insight: `${owner.abbr} takımının toplam skorunun %${pct}'i üç sayılık atışlardan geliyor.`,
    };
  }

  if (key.includes("PTS_SHARE_PAINT")) {
    const pct = (value * 100).toFixed(0);
    const owner = key.startsWith("OPP_") ? awayInfo : homeInfo;
    return {
      title: "Boyalı Alan Skor Payı",
      category: "Şut & Taktik",
      insight: `${owner.abbr} skorunun %${pct}'lik bölümünü pota altından üretiyor.`,
    };
  }

  if (key.includes("FG3_REGRESSION")) {
    return {
      title: "3 Sayı Regresyon Eğilimi",
      category: "Şut & Taktik",
      insight: `3 sayılık atışlarda beklenen sezon ortalamasına dönüş (regresyon) parametresi ${favoredTeam.abbr} lehine avantaj oluşturuyor.`,
    };
  }

  // 4. Momentum, Points & Defense
  if (key.includes("PTS_ALLOWED_LAST_")) {
    const games = key.split("_").pop() || "5";
    const owner = key.startsWith("OPP_") ? awayInfo : homeInfo;
    return {
      title: `Pota Altı & Savunma (Son ${games} Maç)`,
      category: "Form & Savunma",
      insight: `${owner.name} (${owner.abbr}) son ${games} maçında potasında ortalama ${value.toFixed(1)} sayıya izin verdi.`,
    };
  }

  if (key.includes("PTS_LAST_")) {
    const games = key.split("_").pop() || "5";
    const owner = key.startsWith("OPP_") ? awayInfo : homeInfo;
    return {
      title: `Hücum Skoru (Son ${games} Maç)`,
      category: "Form & Savunma",
      insight: `${owner.name} (${owner.abbr}) son ${games} maçında ortalama ${value.toFixed(1)} sayı üretti.`,
    };
  }

  if (key.includes("WINRATE_LAST_") || key.includes("WINRATE_DIFF")) {
    const pct = (value * 100).toFixed(0);
    return {
      title: "Son Dönem Galibiyet Trendi",
      category: "Momentum",
      insight: `${favoredTeam.name} son maçlarında %${pct} galibiyet oranı yakalayarak güçlü bir momentum oluşturdu.`,
    };
  }

  // 5. Roster & Player Depth
  if (key.includes("PROJ_PTS_SUM") || key.includes("PROJ_PRA_SUM")) {
    const owner = key.startsWith("OPP_") ? awayInfo : homeInfo;
    return {
      title: "Kadro Skor Gücü",
      category: "Kadro & Oyuncular",
      insight: `${owner.name} aktif rotasyonundaki oyuncu projeksiyonları toplamda ${value.toFixed(1)} puanlık yüksek bir hücum potansiyeli gösteriyor.`,
    };
  }

  if (key.includes("PROJ_PTS_AVG") || key.includes("PROJ_PRA_AVG")) {
    const owner = key.startsWith("OPP_") ? awayInfo : homeInfo;
    return {
      title: "Rotasyon Oyuncu Ortalaması",
      category: "Kadro & Oyuncular",
      insight: `${owner.abbr} oyuncu başına ortalama ${value.toFixed(1)} sayılık katkı kapasitesine sahip.`,
    };
  }

  // 6. Rest, Venue & Schedule
  if (key === "IS_HOME") {
    return {
      title: "Saha & Seyirci Avantajı",
      category: "Fikstür",
      insight: `${homeInfo.name} kendi sahasında oynamanın getirdiği akustik ve çevresel avantaja sahip.`,
    };
  }

  if (key === "DAYS_REST" || key === "OPP_DAYS_REST" || key === "REST_DIFF") {
    return {
      title: "Dinlenme & Kondisyon Avantajı",
      category: "Fikstür",
      insight: `${favoredTeam.name} maç takviminde dinlenme günleri açısından daha taze bir fiziksel durumda.`,
    };
  }

  if (key === "IS_B2B" || key === "OPP_IS_B2B") {
    const owner = key.startsWith("OPP_") ? awayInfo : homeInfo;
    return {
      title: "Üst Üste Maç (Back-to-Back) Faktörü",
      category: "Fikstür",
      insight: value === 1 
        ? `${owner.name} dün de maç oynadığı için yorgunluk faktörü taşıyor.` 
        : `${owner.name} back-to-back oynamayarak dinlenmiş olarak sahaya çıkıyor.`,
    };
  }

  // 7. Tactical Four Factors
  if (key.includes("AST_TO_TOV")) {
    return {
      title: "Top Dağıtımı (Asist/Top Kaybı Oranı)",
      category: "Taktik",
      insight: `${favoredTeam.name} top kayıplarını minimize edip daha akıcı bir pas trafiği yaratıyor.`,
    };
  }

  if (key.includes("HAVOC_RATE")) {
    return {
      title: "Savunma Baskısı (Havoc Rate)",
      category: "Taktik",
      insight: `${favoredTeam.name} top çalma ve bloklarla rakibi yüksek hata oranına zorluyor.`,
    };
  }

  if (key.includes("FT_MARGIN")) {
    return {
      title: "Serbest Atış Avantajı",
      category: "Taktik",
      insight: `${favoredTeam.name} çizgiye daha sık giderek kolay sayılar bulma üstünlüğüne sahip.`,
    };
  }

  if (key.includes("PACE_COLLISION") || key.includes("PACE")) {
    return {
      title: "Tempo & Pozisyon Sayısı",
      category: "Tempo",
      insight: `Takımların hücum hızları maçın toplam pozisyon sayısını ve skor üretim hızını doğrudan belirliyor.`,
    };
  }

  // Fallback humanized formatter
  const cleanTitle = featureKey
    .replace(/^OPP_/, "Rakip ")
    .replace(/^TEAM_/, "Takım ")
    .replace(/_LAST_\d+/, "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (l) => l.toUpperCase());

  return {
    title: cleanTitle,
    category: "Genel Metrik",
    insight: `${favoredTeam.name} (${favoredTeam.abbr}) lehine gerçekleşen ${value} değeri modelin tercihini destekliyor.`,
  };
}
