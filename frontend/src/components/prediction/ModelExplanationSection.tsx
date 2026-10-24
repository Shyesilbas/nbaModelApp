import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Eye,
  EyeOff,
  Info,
  Lightbulb,
  Sparkles,
  Trophy,
  Zap,
} from "lucide-react";
import type { TeamInfo } from "./types";
import { formatFeatureInsight, type ExplanationContext } from "./featureLabels";

type FeatureImpact = {
  feature_name: string;
  display_name?: string;
  category?: string;
  value: number;
  contribution: number;
  influence?: "FAVORS_HOME" | "FAVORS_AWAY" | "NEUTRAL" | string;
};

// Takım lehine ibaresi
function TeamAdvantageBadge({
  influence,
  homeInfo,
  awayInfo,
}: {
  influence?: string;
  homeInfo: TeamInfo;
  awayInfo: TeamInfo;
}) {
  const isHome = influence === "FAVORS_HOME";
  const isAway = influence === "FAVORS_AWAY";
  const team = isHome ? homeInfo : isAway ? awayInfo : null;

  if (!team) {
    return (
      <span className="text-xs font-medium text-text-muted">
        Nötr
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-text-primary">
      {isHome ? <ArrowUpRight size={16} className="text-text-secondary" /> : <ArrowDownRight size={16} className="text-text-secondary" />}
      <span>{team.name} ({team.abbr}) Lehine</span>
    </span>
  );
}

// Tek bir sebebi gosteren sade ve ferah editoryal satir
function ReasonCard({
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
  const formatted = formatFeatureInsight(
    feature.feature_name,
    feature.value,
    feature.influence ?? "NEUTRAL",
    homeInfo,
    awayInfo,
    ctx
  );

  const contributionAbs = Math.abs(feature.contribution);
  const share = Math.round((contributionAbs / totalImpact) * 100);

  return (
    <article className="py-3 first:pt-1 last:pb-1">
      {/* 1. Baslik, sira ve lehte olan takim */}
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold tabular-nums text-text-muted">
            {rank}.
          </span>
          <h4 className="text-xs font-semibold text-text-primary truncate">
            {formatted.title}
          </h4>
          <span className="text-xs text-text-muted">·</span>
          <span className="text-xs text-text-secondary">
            {formatted.category}
          </span>
        </div>

        <TeamAdvantageBadge
          influence={formatted.neutralBadge ? "NEUTRAL" : feature.influence}
          homeInfo={homeInfo}
          awayInfo={awayInfo}
        />
      </div>

      {/* 2. Sade Aciklama Metni */}
      <p className="text-xs leading-relaxed text-text-secondary pl-4">
        {formatted.insight}
      </p>

      {/* 3. Bar yerine Guc Puani ve Olculen Deger Bilgisi */}
      <div className="pl-4 pt-1.5 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 text-text-muted">
          <span className="tabular-nums">Etki Payı: %{share}</span>
        </div>

        {formatted.simpleValue && (
          <span className="text-text-secondary font-medium tabular-nums text-xs">
            {formatted.simpleValue}
          </span>
        )}
      </div>

      {/* Opsiyonel Teknik Detay Alani */}
      {showTech && (
        <div className="ml-4 mt-2 rounded border border-border bg-background-tertiary/40 px-2.5 py-1.5 text-xs text-text-secondary flex flex-wrap items-center justify-between gap-2 tabular-nums">
          <span>Değişken: <strong>{feature.feature_name}</strong></span>
          <span>Ham Değer: <strong>{feature.value}</strong></span>
          <span>
            SHAP:{" "}
            <strong className={feature.contribution >= 0 ? "text-status-success" : "text-status-error"}>
              {feature.contribution >= 0 ? "+" : ""}
              {feature.contribution.toFixed(4)}
            </strong>
          </span>
        </div>
      )}
    </article>
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
        <h3 className="text-sm font-semibold text-text-primary">Model açıklaması bulunamadı</h3>
        <p className="mt-1 text-xs text-text-secondary leading-relaxed">
          Bu maç için etken analizi verisi üretilmedi. Ana tahmin sonuçları geçerlidir.
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

  return (
    <section className="space-y-4">
      {/* 1. Baslik Alani */}
      <header className="rounded border border-border bg-background-primary p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-border bg-background-secondary text-primary">
              <Sparkles size={18} />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-text-primary">
                Modelin Karar Gerekçeleri
              </h3>
              <p className="mt-0.5 text-xs text-text-secondary">
                Modelin bu maçı değerlendirirken en çok ağırlık verdiği ve tercihi belirleyen <strong>5 temel neden</strong>:
              </p>
            </div>
          </div>

          {winnerName && (
            <div className="inline-flex shrink-0 items-center gap-1.5 rounded-sm border border-border bg-background-secondary px-2.5 py-1 text-xs font-semibold text-text-primary">
              <span className="text-text-secondary font-normal">Favori:</span>
              <span>{favoredTeam.name}</span>
            </div>
          )}
        </div>
      </header>

      {/* 2. Sekme Seçici */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div
          role="tablist"
          aria-label="Sebep kategorileri"
          className="inline-flex rounded border border-border bg-background-secondary p-0.5 gap-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "win"}
            onClick={() => setActiveTab("win")}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              activeTab === "win"
                ? "bg-background-primary text-text-primary border border-border "
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            <Trophy size={16} />
            <span>Kazanma Tercihi (5 Sebep)</span>
          </button>

          {scoreTop5.length > 0 && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "score"}
              onClick={() => setActiveTab("score")}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                activeTab === "score"
                  ? "bg-background-primary text-text-primary border border-border "
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              <Zap size={16} />
              <span>Skor ve Sayı Beklentisi (5 Sebep)</span>
            </button>
          )}
        </div>

        {/* Teknik Değerleri Göster / Gizle */}
        <button
          type="button"
          onClick={() => setShowTechDetails((prev) => !prev)}
          className="inline-flex items-center gap-1.5 rounded border border-border bg-background-primary px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
        >
          {showTechDetails ? <EyeOff size={16} /> : <Eye size={16} />}
          <span>{showTechDetails ? "Teknik Değerleri Gizle" : "Teknik Verileri Göster"}</span>
        </button>
      </div>

      {/* 3. Tam 5 Tane Öne Çıkan Sebep (Çizgili Editoryal Liste) */}
      <div className="rounded border border-border bg-background-primary divide-y divide-border-light px-4">
        {activeFeatures.map((feature, index) => (
          <ReasonCard
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
      </div>

      {/* 4. Özet Değerlendirme Kutusu */}
      {top1Insight && top2Insight && (
        <footer className="rounded border border-border bg-background-secondary p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border bg-background-primary text-primary">
              <Lightbulb size={16} />
            </span>
            <div className="min-w-0">
              <h5 className="text-xs font-semibold text-text-primary">
                Genel Değerlendirme
              </h5>
              <p className="mt-1 text-xs sm:text-sm leading-relaxed text-text-secondary">
                Modelimiz bu karşılaşmada özellikle <strong>{favoredTeam.name}</strong> lehine olan{" "}
                <strong className="text-text-primary font-medium">{top1Insight.title}</strong> ve{" "}
                <strong className="text-text-primary font-medium">{top2Insight.title}</strong> avantajları sayesinde
                bu takımın galibiyete daha yakın olduğunu değerlendirmektedir.
              </p>
            </div>
          </div>
        </footer>
      )}
    </section>
  );
}
