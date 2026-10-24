import type { TeamInfo } from "./types";
import { useLanguage } from "../../context/LanguageContext";

interface NarrativeBlockProps {
  result: any;
  homeInfo: TeamInfo;
  awayInfo: TeamInfo;
  winnerInfo: TeamInfo;
}

export function NarrativeBlock({ result, homeInfo, awayInfo, winnerInfo }: NarrativeBlockProps) {
  const { language } = useLanguage();
  const win = result.win_probability;
  const score = result.score_prediction;
  const prob = Math.max(win?.home_win_probability ?? 0, win?.away_win_probability ?? 0);
  const margin = score ? Math.abs(score.predicted_margin) : null;
  const loserInfo = winnerInfo.abbr === homeInfo.abbr ? awayInfo : homeInfo;
  const confidence = win?.confidence_bucket || "";
  
  const confStrEn = confidence.toUpperCase().includes("STRONG")
    ? "with strong conviction"
    : confidence.toUpperCase().includes("MODERATE")
      ? "with moderate confidence"
      : "in a lean projection";

  const confStrTr = confidence.toUpperCase().includes("STRONG")
    ? "yüksek güvenilirlikle"
    : confidence.toUpperCase().includes("MODERATE")
      ? "orta düzeyde güvenle"
      : "dengeli bir beklentiyle";

  const narrative = language === "tr"
    ? `Model, %${(prob * 100).toFixed(1)} kazanma olasılığıyla ${winnerInfo.name} ekibinin bu karşılaşmayı ${confStrTr} kontrol edeceğini öngörüyor. ${
        margin !== null
          ? `Beklenen ${margin.toFixed(1)} sayılık galibiyet marjı, ${winnerInfo.abbr} ekibinin maç boyunca ritmi elinde tutacağını; ${loserInfo.abbr} tarafının ise kazanmak için olağan ortalamasının üzerine çıkması gerekeceğini gösteriyor.`
          : `${loserInfo.name} takımının galibiyeti alabilmesi için model projeksiyonunun üzerine çıkması gerekecek.`
      }${
        score
          ? ` Hücum verimliliği ve ${winnerInfo.abbr === homeInfo.abbr ? "saha avantajı" : "deplasman direnci"} bu tahmini destekleyen temel faktörler arasında yer alıyor.`
          : ""
      }`
    : `The model projects ${winnerInfo.name} to control this matchup ${confStrEn}, assigning a ${(prob * 100).toFixed(1)}% win probability. ${
        margin !== null
          ? `The expected winning margin of ${margin.toFixed(1)} points suggests ${winnerInfo.abbr} maintains an edge throughout, while ${loserInfo.abbr} will need to outperform baseline expectations.`
          : `${loserInfo.name} will need to overcome the model's assessment to secure the win.`
      }${
        score
          ? ` Offensive efficiency and ${winnerInfo.abbr === homeInfo.abbr ? "home court advantage" : "road performance"} contribute to the forecast.`
          : ""
      }`;

  return (
    <div className="rounded border border-border bg-background-primary p-4">
      <p className="text-xs font-medium text-text-secondary mb-1.5">
        {language === "tr" ? "Öngörülen Karşılaşma Senaryosu" : "Predicted game script"}
      </p>
      <p className="text-xs text-text-secondary leading-relaxed">{narrative}</p>
    </div>
  );
}
