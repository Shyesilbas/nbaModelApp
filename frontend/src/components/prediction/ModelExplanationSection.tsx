import { useMemo, useState } from "react";
import { Info } from "lucide-react";
import TeamLogo from "../TeamLogo";
import type { TeamInfo } from "./types";
import { formatFeatureInsight, type ExplanationContext } from "./featureLabels";
import { useLanguage } from "../../context/LanguageContext";

type FeatureImpact = {
  feature_name: string;
  display_name?: string;
  category?: string;
  value: number;
  contribution: number;
  influence?: "FAVORS_HOME" | "FAVORS_AWAY" | "NEUTRAL" | string;
};

// Tek bir sebep: lehine olan takım solda, açıklama ortada, etki payı sağda
function ReasonRow({
  feature,
  rank,
  totalImpact,
  homeInfo,
  awayInfo,
  showTech,
  ctx,
}: {
  feature: FeatureImpact;
  rank: number;
  totalImpact: number;
  homeInfo: TeamInfo;
  awayInfo: TeamInfo;
  showTech: boolean;
  ctx?: ExplanationContext;
}) {
  const { language } = useLanguage();
  const tr = language === "tr";
  const formatted = formatFeatureInsight(
    feature.feature_name,
    feature.value,
    feature.influence ?? "NEUTRAL",
    homeInfo,
    awayInfo,
    ctx
  );
  const influence = formatted.neutralBadge ? "NEUTRAL" : feature.influence;
  const team = influence === "FAVORS_HOME" ? homeInfo : influence === "FAVORS_AWAY" ? awayInfo : null;
  const share = Math.round((Math.abs(feature.contribution) / totalImpact) * 100);

  return (
    <li className="grid grid-cols-[auto_1fr_auto] items-start gap-x-4 gap-y-1 py-4">
      <span className="w-5 pt-0.5 text-right text-xs font-semibold tabular-nums text-text-muted">{rank}</span>

      <div className="min-w-0">
        <h4 className="text-sm font-semibold text-text-primary">{formatted.title}</h4>
        <p className="mt-1 text-sm leading-relaxed text-text-secondary">{formatted.insight}</p>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 text-xs text-text-muted">
          <span>{formatted.category}</span>
          {formatted.simpleValue && <span className="tabular-nums text-text-secondary">{formatted.simpleValue}</span>}
        </p>
        {showTech && (
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 rounded border border-border bg-background-tertiary/40 px-2.5 py-1.5 text-xs tabular-nums text-text-secondary">
            <span>{tr ? "Değişken" : "Feature"}: <strong>{feature.feature_name}</strong></span>
            <span>{tr ? "Ham değer" : "Raw value"}: <strong>{feature.value}</strong></span>
            <span>
              SHAP:{" "}
              <strong className={feature.contribution >= 0 ? "text-status-success" : "text-status-error"}>
                {feature.contribution >= 0 ? "+" : ""}
                {feature.contribution.toFixed(4)}
              </strong>
            </span>
          </p>
        )}
      </div>

      <div className="flex w-24 shrink-0 flex-col items-end gap-1.5 text-right">
        {team ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-text-primary">
            <TeamLogo abbr={team.abbr} name={team.name} size={20} />
            {team.abbr}
          </span>
        ) : (
          <span className="text-xs text-text-muted">{tr ? "Nötr" : "Neutral"}</span>
        )}
        <div className="h-1 w-full overflow-hidden rounded-full bg-background-tertiary" aria-hidden="true">
          <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
        </div>
        <span className="text-xs tabular-nums text-text-muted">
          {tr ? "Etki" : "Impact"} %{share}
        </span>
      </div>
    </li>
  );
}

type PredictionResult = {
  explanation?: {
    win_probability?: {
      context?: ExplanationContext;
      features?: FeatureImpact[];
      predicted_winner?: string;
    };
    score_prediction?: {
      margin_features?: FeatureImpact[];
      pace_features?: FeatureImpact[];
      home_rtg_features?: FeatureImpact[];
      away_rtg_features?: FeatureImpact[];
    };
  };
  win_probability?: {
    predicted_winner?: string;
    home_win_probability?: number;
    away_win_probability?: number;
  };
};

export function ModelExplanationSection({
  result,
  homeInfo,
  awayInfo,
}: {
  result: PredictionResult | null | undefined;
  homeInfo: TeamInfo;
  awayInfo: TeamInfo;
}) {
  const { language } = useLanguage();
  const [activeTab, setActiveTab] = useState<"win" | "score">("win");
  const [showTechDetails, setShowTechDetails] = useState(false);

  const explanation = result?.explanation;

  // Yorgunluk bayragi 0 ise kimse yorgun degil; baseline kaymasindan gelen katki sebep olarak gosterilmez
  const isInactiveRestFlag = (f: FeatureImpact) =>
    (f.feature_name === "IS_B2B" || f.feature_name === "OPP_IS_B2B") && f.value === 0;

  // Kazanma olasiligi modelinin one cikan en onemli 5 sebebi
  const winTop5 = useMemo(() => {
    const list: FeatureImpact[] = explanation?.win_probability?.features ?? [];
    return [...list]
      .filter((f) => Math.abs(f.contribution) > 0.0001 && !isInactiveRestFlag(f))
      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
      .slice(0, 5);
  }, [explanation]);

  // Skor modelinin one cikan en onemli 5 sebebi
  const scoreTop5 = useMemo(() => {
    const score = explanation?.score_prediction;
    if (!score) return [];
    const combined: FeatureImpact[] = [
      ...(score.margin_features ?? []),
      ...(score.pace_features ?? []),
      ...(score.home_rtg_features ?? []),
      ...(score.away_rtg_features ?? []),
    ];
    return [...combined]
      .filter((f) => Math.abs(f.contribution) > 0.0001 && !isInactiveRestFlag(f))
      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
      .slice(0, 5);
  }, [explanation]);

  const winContext = explanation?.win_probability?.context;
  const activeFeatures = activeTab === "win" ? winTop5 : scoreTop5;

  const totalImpact = useMemo(() => {
    return activeFeatures.reduce((sum, f) => sum + Math.abs(f.contribution), 0) || 1;
  }, [activeFeatures]);



  if (!explanation || (!winTop5.length && !scoreTop5.length)) {
    return (
      <div className="rounded border border-border bg-background-primary p-6 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded border border-border bg-background-secondary text-text-secondary mb-3">
          <Info size={18} />
        </div>
        <h3 className="text-sm font-semibold text-text-primary">
          {language === "tr" ? "Model açıklaması bulunamadı" : "Model explanation not available"}
        </h3>
        <p className="mt-1 text-xs text-text-secondary leading-relaxed">
          {language === "tr"
            ? "Bu maç için etken analizi verisi üretilmedi. Ana tahmin sonuçları geçerlidir."
            : "Feature explanation factors are not generated for this match. Primary prediction results remain valid."}
        </p>
      </div>
    );
  }

  // Ozet metni olustur
  const winnerName = result?.win_probability?.predicted_winner;
  const isHomeWinner = winnerName === homeInfo.name || winnerName === homeInfo.abbr;
  const favoredTeam = isHomeWinner ? homeInfo : awayInfo;

  const top1Insight = activeFeatures[0]
    ? formatFeatureInsight(
        activeFeatures[0].feature_name,
        activeFeatures[0].value,
        activeFeatures[0].influence ?? "NEUTRAL",
        homeInfo,
        awayInfo,
        winContext
      )
    : null;

  const top2Insight = activeFeatures[1]
    ? formatFeatureInsight(
        activeFeatures[1].feature_name,
        activeFeatures[1].value,
        activeFeatures[1].influence ?? "NEUTRAL",
        homeInfo,
        awayInfo,
        winContext
      )
    : null;

  const tr = language === "tr";
  const tabBtn = (id: "win" | "score", label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={activeTab === id}
      onClick={() => setActiveTab(id)}
      className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
        activeTab === id
          ? "border-primary font-semibold text-text-primary"
          : "border-transparent text-text-secondary hover:text-text-primary"
      }`}
    >
      {label}
    </button>
  );

  return (
    <section className="space-y-5">
      {top1Insight && top2Insight && (
        <div className="flex items-start gap-4">
          <TeamLogo abbr={favoredTeam.abbr} name={favoredTeam.name} size={44} />
          <div className="min-w-0">
            <p className="text-xs text-text-muted">{tr ? "Modelin özeti" : "Model summary"}</p>
            <p className="mt-0.5 text-base leading-relaxed text-text-primary">
              {tr ? (
                <>
                  Model <strong>{favoredTeam.name}</strong> tarafını tutuyor; en belirleyici nedenler{" "}
                  <strong>{top1Insight.title}</strong> ve <strong>{top2Insight.title}</strong>.
                </>
              ) : (
                <>
                  The model leans <strong>{favoredTeam.name}</strong>, mainly because of{" "}
                  <strong>{top1Insight.title}</strong> and <strong>{top2Insight.title}</strong>.
                </>
              )}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border">
        <div role="tablist" aria-label={tr ? "Sebep kategorileri" : "Driver categories"} className="flex">
          {tabBtn("win", tr ? "Kazanma tercihi" : "Win probability")}
          {scoreTop5.length > 0 && tabBtn("score", tr ? "Skor ve tempo" : "Score and pace")}
        </div>
        <button
          type="button"
          onClick={() => setShowTechDetails((prev) => !prev)}
          aria-pressed={showTechDetails}
          className="pb-2 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary cursor-pointer"
        >
          {showTechDetails
            ? (tr ? "Teknik verileri gizle" : "Hide technical details")
            : (tr ? "Teknik verileri göster" : "Show technical details")}
        </button>
      </div>

      <ol className="divide-y divide-border-light">
        {activeFeatures.map((feature, index) => (
          <ReasonRow
            key={`${feature.feature_name}-${index}`}
            feature={feature}
            rank={index + 1}
            totalImpact={totalImpact}
            homeInfo={homeInfo}
            awayInfo={awayInfo}
            showTech={showTechDetails}
            ctx={winContext}
          />
        ))}
      </ol>
    </section>
  );
}
