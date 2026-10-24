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

// "6-4" gibi kayit; oran son 10 maca (sezon basinda oynanan tum maclara) aittir.
function formatRecord(winrate: number | null | undefined, games: number | undefined): string | null {
  if (winrate == null || !games) return null;
  const played = Math.min(games, FORM_WINDOW);
  const wins = Math.round(winrate * played);
  return `${wins}-${played - wins}`;
}

export function formatFeatureInsight(
  featureKey: string,
  value: number,
  influence: string,
  homeInfo: TeamInfo,
  awayInfo: TeamInfo,
  ctx?: ExplanationContext
): FormattedFeatureInfo {
  const key = featureKey.toUpperCase();
  const favorsHome = influence === "FAVORS_HOME";
  const favoredTeam = favorsHome ? homeInfo : awayInfo;
  const minGames = ctx ? Math.min(ctx.home_games_played ?? 0, ctx.away_games_played ?? 0) : FORM_WINDOW;
  const formWindow = minGames > 0 && minGames < FORM_WINDOW ? `bu sezonki ${minGames} maçta` : "son maçlarında";

  // 1. Skor Modeli Tahmini
  if (key === "SCORE_PRED_MARGIN") {
    const marginAbs = Math.abs(value).toFixed(1);
    return {
      title: "Skor Modeli Öngörüsü",
      category: "Skor Tahmini",
      categoryIcon: "zap",
      simpleValue: `+${marginAbs} Sayı Fark`,
      insight: `Skor tahmin algoritmamız, ${favoredTeam.name} takımının maç sonunda rakibine yaklaşık ${marginAbs} sayı üstünlük kuracağını öngörüyor.`,
    };
  }

  // Kadro durumu: formun hesaba kattığı oyunculardan kim bu maçta yok/kısıtlı
  if (key === "ABS_DIFF") {
    const pts = Math.abs(value).toFixed(1);
    return {
      title: "Kadro Durumu",
      category: "Kadro & Güç",
      categoryIcon: "activity",
      simpleValue: `${pts} Puanlık Kadro Farkı`,
      insight: `Son maçlardaki forma göre ${favoredTeam.name} bu maça daha eksiksiz bir rotasyonla çıkıyor; rakipte yok veya kısıtlı oyuncuların etkisi hesaba katıldı.`,
    };
  }

  // 2. Elo ve Güç Sıralaması
  if (key === "ELO_DIFF" || key === "ABS_ELO_DIFF") {
    const eloAbs = Math.abs(value).toFixed(0);
    const eloLevel = Math.abs(value) >= 100 ? "belirgin şekilde" : Math.abs(value) >= 40 ? "bir miktar" : "hafifçe";
    return {
      title: "Takım Kalitesi ve Güç Sıralaması",
      category: "Kadro & Güç",
      categoryIcon: "trophy",
      simpleValue: `+${eloAbs} Elo Farkı`,
      insight: `${favoredTeam.name}, Elo güç sıralamasında rakibinin ${eloLevel} önünde yer alıyor.`,
    };
  }

  if (key === "PRE_GAME_ELO") {
    return {
      title: "Ev Sahibi Güç Seviyesi",
      category: "Kadro & Güç",
      categoryIcon: "trophy",
      simpleValue: `${value.toFixed(0)} Elo`,
      insight: `${homeInfo.name}, lig ortalamasının üzerindeki yüksek güç puanıyla sahaya favori profilinde çıkıyor.`,
    };
  }

  if (key === "OPP_PRE_GAME_ELO") {
    return {
      title: "Deplasman Güç Seviyesi",
      category: "Kadro & Güç",
      categoryIcon: "trophy",
      simpleValue: `${value.toFixed(0)} Elo`,
      insight: `${awayInfo.name}, deplasmanda zorlu bir rakibe karşı lig seviyesini korumaya çalışacak.`,
    };
  }

  // 3. Saha ve Seyirci Avantajı
  if (key === "IS_HOME") {
    return {
      title: "Saha ve Seyirci Desteği",
      category: "Saha Avantajı",
      categoryIcon: "home",
      simpleValue: "Kendi Sahasında",
      insight: `${homeInfo.name}, karşılaşmayı kendi taraftarı önünde oynamanın getirdiği kritik bir atmosfer ve saha avantajına sahip.`,
    };
  }

  if (key.includes("CURRENT_VENUE_WINRATE") || key.includes("HOME_WINRATE") || key.includes("AWAY_WINRATE")) {
    const pct = (Math.abs(value) * 100).toFixed(0);
    return {
      title: "Bu Sahadaki Başarı Alışkanlığı",
      category: "Saha Avantajı",
      categoryIcon: "home",
      simpleValue: `%${pct} Galibiyet`,
      insight: `${favoredTeam.name}, bu salonda oynadığı son maçlarda yüksek bir kazanma oranı tutturarak güçlü bir salon uyumu sergiledi.`,
    };
  }

  if (key.includes("CURRENT_VENUE_PTS")) {
    return {
      title: "Bu Salondaki Skor Dengesi",
      category: "Saha Avantajı",
      categoryIcon: "home",
      simpleValue: `${value.toFixed(1)} Sayı`,
      insight: `${favoredTeam.name}, bu salonda oynadığı karşılaşmalarda hücum ritmini ve skor temposunu çok daha rahat buluyor.`,
    };
  }

  // 4. Dinlenme ve Kondisyon
  if (key === "DAYS_REST" || key === "OPP_DAYS_REST" || key === "REST_DIFF") {
    const days = Math.abs(value).toFixed(0);
    return {
      title: "Dinlenme ve Kondisyon Üstünlüğü",
      category: "Fikstür & Kondisyon",
      categoryIcon: "clock",
      simpleValue: `${days} Gün Dinlenme`,
      insight: `${favoredTeam.name}, maç takviminde daha fazla dinlenme fırsatı bularak bu maça fiziksel olarak çok daha diri ve dinç çıkıyor.`,
    };
  }

  if (key === "IS_B2B" || key === "OPP_IS_B2B") {
    const homeTired = ctx?.home_is_b2b ?? (key === "IS_B2B" && value === 1);
    const awayTired = ctx?.away_is_b2b ?? (key === "OPP_IS_B2B" && value === 1);
    const base = { title: "Üst Üste Maç (Yorgunluk) Faktörü", category: "Fikstür & Kondisyon", categoryIcon: "clock" as const };
    if (homeTired && awayTired) {
      return {
        ...base,
        neutralBadge: true,
        simpleValue: "İki takım da dün oynadı",
        insight: `${homeInfo.name} ve ${awayInfo.name} dün gece de maç oynadı; yorgunluk açısından bir takıma avantaj yok.`,
      };
    }
    const tired = homeTired ? homeInfo : awayInfo;
    const rested = homeTired ? awayInfo : homeInfo;
    return {
      ...base,
      simpleValue: `${tired.abbr} üst üste maçta`,
      insight: `${tired.name} dün gece de maç oynadığı için yorgunluk dezavantajı taşıyor; ${rested.name} dinlenmiş çıkıyor.`,
    };
  }

  // 5. Net Rating ve Oyun Verimliliği
  if (key.includes("NET_RTG_DIFF")) {
    const diff = Math.abs(value).toFixed(1);
    return {
      title: "Son Dönem Oyun Verimliliği",
      category: "Form & Ritim",
      categoryIcon: "activity",
      simpleValue: `+${diff} Verimlilik Farkı`,
      insight: `${favoredTeam.name}, ${formWindow} sahada kaldığı her 100 hücumda rakibinden ${Math.abs(value) >= 5 ? "belirgin şekilde " : ""}daha iyi bir sayı farkı üretti.`,
    };
  }

  // 6. Şut Kalitesi ve Yüzdesi (eFG)
  if (key.includes("EFG_DIFF")) {
    const diff = (Math.abs(value) * 100).toFixed(1);
    return {
      title: "Şut Kalitesi ve İsabet Oranı",
      category: "Şut & Hücum",
      categoryIcon: "target",
      simpleValue: `%${diff} Daha İsabetli`,
      insight: `${favoredTeam.name}, son karşılaşmalarda doğru şut seçimleri ve yüksek saha içi isabet oranıyla hücumda rakibine bariz üstünlük kurdu.`,
    };
  }

  // 7. Galibiyet kaydi (son 10 mac; sezon basinda yalnizca bu sezonun maclari)
  if (key.includes("WINRATE_LAST_") || key.includes("WINRATE_DIFF")) {
    const homeWr = ctx?.home_winrate_last_10;
    const awayWr = ctx?.away_winrate_last_10;
    const homeRec = formatRecord(homeWr, ctx?.home_games_played);
    const awayRec = formatRecord(awayWr, ctx?.away_games_played);
    const early = minGames > 0 && minGames < FORM_WINDOW;
    const title = early ? "Sezon Başı Galibiyet Kaydı" : "Son 10 Maçtaki Galibiyet Kaydı";

    if (homeRec && awayRec && homeWr != null && awayWr != null) {
      const better = homeWr > awayWr ? homeInfo : homeWr < awayWr ? awayInfo : null;
      const sample = early ? ` Örneklem çok küçük (${ctx?.home_games_played} ve ${ctx?.away_games_played} maç), bu yüzden bu sinyal gürültülü.` : "";
      let reading: string;
      if (!better) {
        reading = "İki takımın kaydı eşit.";
      } else if (better.abbr === favoredTeam.abbr) {
        reading = `Daha iyi kayıt ${better.name} tarafında ve model bunu onun lehine sayıyor.`;
      } else {
        reading = `Daha iyi kayıt ${better.name} tarafında, ancak model Elo ve net rating zaten aynı bilgiyi taşıdığı için bu farka ters yönde ağırlık veriyor; bu satır ${favoredTeam.name} için iyi form anlamına gelmiyor.`;
      }
      return {
        title,
        category: "Form & Kayıt",
        categoryIcon: "activity",
        simpleValue: `${homeInfo.abbr} ${homeRec} · ${awayInfo.abbr} ${awayRec}`,
        insight: `${homeInfo.name} ${homeRec}, ${awayInfo.name} ${awayRec}. ${reading}${sample}`,
      };
    }
    const pct = (Math.abs(value) * 100).toFixed(0);
    return {
      title,
      category: "Form & Kayıt",
      categoryIcon: "activity",
      simpleValue: `%${pct} Oran Farkı`,
      insight: `İki takımın son maçlardaki galibiyet oranı arasında %${pct} fark var; model bu farkı ${favoredTeam.name} lehine sayıyor.`,
    };
  }

  // 8. Hücum ve Savunma Skorları
  if (key.includes("PTS_ALLOWED_LAST_")) {
    return {
      title: "Savunma Sertliği ve Pota Savunması",
      category: "Savunma & Direnç",
      categoryIcon: "shield",
      simpleValue: `${value.toFixed(1)} Sayı Yedi`,
      insight: `${favoredTeam.name}, son maçlarda potasında az sayı görerek disiplinli, caydırıcı ve sert bir savunma performansı sergiledi.`,
    };
  }

  if (key.includes("PTS_LAST_")) {
    return {
      title: "Hücum Skoru ve Üretkenlik",
      category: "Şut & Hücum",
      categoryIcon: "target",
      simpleValue: `${value.toFixed(1)} Sayı Ort.`,
      insight: `${favoredTeam.name}, son maçlarında yüksek hücum temposu ve skorer performansıyla hücumda formda bir dönemden geçiyor.`,
    };
  }

  // 9. Üç Sayı ve Şut Dağılımı
  if (key.includes("PTS_SHARE_3PT") || key.includes("THREE_POINT_RATE")) {
    const pct = (Math.abs(value) * 100).toFixed(0);
    return {
      title: "Üç Sayılık Şut Tehdidi",
      category: "Şut & Hücum",
      categoryIcon: "target",
      simpleValue: `%${pct} Dış Şut Oranı`,
      insight: `${favoredTeam.name}, modern basketbolun temeli olan üç sayılık atışlarda rakibine kıyasla çok daha skorer ve tehlikeli bir hücum çeşitliliğine sahip.`,
    };
  }

  if (key.includes("PTS_SHARE_PAINT")) {
    const pct = (Math.abs(value) * 100).toFixed(0);
    return {
      title: "Pota Altı ve Çember Üstünlüğü",
      category: "Pota Altı & Fizik",
      categoryIcon: "shield",
      simpleValue: `%${pct} Boyalı Alan Sayısı`,
      insight: `${favoredTeam.name}, pota altındaki fiziksel üstünlüğüyle boyalı alanda yüksek yüzdeli kolay sayılar üretiyor.`,
    };
  }

  // 10. Top Kontrolü ve Pas Dağıtımı
  if (key.includes("TOV_FORCED_DIFF") || key.includes("AST_TO_TOV")) {
    return {
      title: "Top Kontrolü ve Pas Kalitesi",
      category: "Taktik & Disiplin",
      categoryIcon: "activity",
      simpleValue: "Top Kaybı Avantajı",
      insight: `${favoredTeam.name}, akıllı pas dağıtımıyla top kayıplarını minimumda tutarken rakibini hataya zorlayarak kolay sayılar buluyor.`,
    };
  }

  // 11. Ribaunt Kontrolü
  if (key.includes("REBOUND_CONTROL_DIFF")) {
    return {
      title: "Pota Altı Ribaunt Hakimiyeti",
      category: "Pota Altı & Fizik",
      categoryIcon: "shield",
      simpleValue: "Ribaunt Üstünlüğü",
      insight: `${favoredTeam.name}, ribaundları kontrol ederek rakibe ikinci şans sayısı vermiyor ve maçın temposunu belirliyor.`,
    };
  }

  // 12. İkili Rekabet (H2H)
  if (key.includes("H2H_WINRATE") || key.includes("H2H_PTS")) {
    return {
      title: "İki Takım Arasındaki Psikolojik Üstünlük",
      category: "İkili Rekabet",
      categoryIcon: "scale",
      simpleValue: "Geçmiş Maç Üstünlüğü",
      insight: `${favoredTeam.name}, bu iki takım arasında oynanan son maçlarda rakibine karşı belirgin bir psikolojik ve skor üstünlüğü sağladı.`,
    };
  }

  // 13. Maç Temposu
  if (key.includes("PACE")) {
    return {
      title: "Hızlı Oyun ve Maç Temposu",
      category: "Maç Temposu",
      categoryIcon: "zap",
      simpleValue: `${value.toFixed(1)} Pozisyon Hızı`,
      insight: `Beklenen maç temposu ve oyun hızı, açık sahayı iyi kullanan ${favoredTeam.name} ekibinin oyun karakterini doğrudan destekliyor.`,
    };
  }

  // 14. Kadro ve Oyuncu Projeksiyonları
  if (key.includes("PROJ_PTS") || key.includes("PROJ_PRA")) {
    return {
      title: "Kadro Skor Gücü ve Derinliği",
      category: "Kadro & Güç",
      categoryIcon: "trophy",
      simpleValue: `${value.toFixed(1)} Puan Kapasitesi`,
      insight: `${favoredTeam.name} rotasyonundaki aktif oyuncular, maç genelinde rakibine kıyasla daha yüksek bir hücum potansiyeli ortaya koyuyor.`,
    };
  }

  // Fallback temiz başlık ve açıklama
  const cleanTitle = featureKey
    .replace(/^OPP_/, "Rakip ")
    .replace(/^TEAM_/, "")
    .replace(/_LAST_\d+/, "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (l) => l.toUpperCase());

  return {
    title: cleanTitle,
    category: "Genel İstatistik",
    categoryIcon: "activity",
    simpleValue: typeof value === "number" ? value.toFixed(1) : String(value),
    insight: `${favoredTeam.name} takımının bu istatistikteki avantajı, modelimizin galibiyet kararını doğrudan destekleyen faktörler arasında yer alıyor.`,
  };
}
