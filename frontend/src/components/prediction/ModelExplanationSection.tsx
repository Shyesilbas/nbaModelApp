import { useMemo, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  Eye,
  EyeOff,
  Home,
  Info,
  Lightbulb,
  Scale,
  Shield,
  Sparkles,
  Target,
  Trophy,
  Zap,
} from "lucide-react";
import type { TeamInfo } from "./types";
import { formatFeatureInsight } from "./featureLabels";

type FeatureImpact = {
  feature_name: string;
  display_name?: string;
  category?: string;
  value: number;
  contribution: number;
  influence?: "FAVORS_HOME" | "FAVORS_AWAY" | "NEUTRAL" | string;
};

// Kategoriye gore uygun ve sade ikon secer
function CategoryIcon({ type }: { type?: string }) {
  switch (type) {
    case "trophy":
      return <Trophy size={14} className="text-status-warning" />;
    case "zap":
      return <Zap size={14} className="text-primary" />;
    case "clock":
      return <Clock size={14} className="text-status-success" />;
    case "home":
      return <Home size={14} className="text-primary" />;
    case "target":
      return <Target size={14} className="text-status-error" />;
    case "shield":
      return <Shield size={14} className="text-primary" />;
    case "scale":
      return <Scale size={14} className="text-primary" />;
    default:
      return <Activity size={14} className="text-text-secondary" />;
  }
}

// Sıraya gore etki derecesi rozeti
function RankBadge({ rank }: { rank: number }) {
  let label = "Destekleyici Faktör";
  if (rank === 1) label = "En Belirleyici Faktör";
  else if (rank === 2) label = "Çok Yüksek Etki";
  else if (rank === 3) label = "Yüksek Etki";
  else if (rank === 4) label = "Önemli Katkı";

  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-sm bg-background-secondary border border-border text-xs font-medium text-text-secondary">
      {label}
    </span>
  );
}

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
      <span className="inline-flex items-center rounded-sm bg-background-secondary border border-border px-2 py-0.5 text-xs font-medium text-text-secondary">
        Dengeli / Nötr
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium bg-background-secondary border border-border text-text-primary">
      {isHome ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
      <span>{team.name} ({team.abbr}) Lehine</span>
    </span>
  );
}

// Tek bir sebebi gosteren sade kart
function ReasonCard({
  feature,
  rank,
  maxImpact,
  totalImpact,
  homeInfo,
  awayInfo,
  showTech,
}: {
  feature: FeatureImpact;
  rank: number;
  maxImpact: number;
  totalImpact: number;
  homeInfo: TeamInfo;
  awayInfo: TeamInfo;
  showTech: boolean;
}) {
  const formatted = formatFeatureInsight(
    feature.feature_name,
    feature.value,
    feature.influence ?? "NEUTRAL",
    homeInfo,
    awayInfo
  );

  const team =
    feature.influence === "FAVORS_HOME"
      ? homeInfo
      : feature.influence === "FAVORS_AWAY"
      ? awayInfo
      : null;

  const contributionAbs = Math.abs(feature.contribution);
  const share = (contributionAbs / totalImpact) * 100;
  const relativePercent = Math.max(12, Math.round((contributionAbs / maxImpact) * 100));

  return (
    <article className="relative bg-background-primary border border-border rounded p-4 space-y-3 hover:border-card-border-hover transition-colors">
      {/* Kart Ust Baslik Alani */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-border-light">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-sm border border-border bg-background-secondary flex items-center justify-center text-xs font-semibold text-text-primary">
            {rank}
          </div>
          <div className="flex items-center gap-1.5 rounded-sm bg-background-secondary border border-border px-2 py-0.5 text-xs font-medium text-text-secondary">
            <CategoryIcon type={formatted.categoryIcon} />
            <span>{formatted.category}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <RankBadge rank={rank} />
          <TeamAdvantageBadge
            influence={feature.influence}
            homeInfo={homeInfo}
            awayInfo={awayInfo}
          />
        </div>
      </div>

      {/* Aciklama Metni */}
      <div>
        <h4 className="text-sm font-semibold text-text-primary">
          {formatted.title}
        </h4>
        <p className="mt-1 text-xs leading-relaxed text-text-secondary">
          {formatted.insight}
        </p>
      </div>

      {/* Gorsel Etki Cubugu ve Ozet Veri */}
      <div className="pt-2 border-t border-border-light">
        <div className="flex items-center justify-between gap-2 text-xs text-text-secondary mb-1">
          <span>Model Ağırlık Seviyesi</span>
          <span className="font-medium text-text-primary tabular-nums">
            {formatted.simpleValue ? `Ölçülen: ${formatted.simpleValue}` : `%${share.toFixed(0)} Model Payı`}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-background-tertiary">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${relativePercent}%`,
              backgroundColor: team?.color || "currentColor",
            }}
          />
        </div>
      </div>

      {/* Teknik Detay Alani */}
      {showTech && (
        <div className="mt-2 rounded border border-border bg-background-secondary p-2.5 text-xs text-text-secondary flex flex-wrap items-center justify-between gap-2 font-mono">
          <span>Değişken: <strong>{feature.feature_name}</strong></span>
          <span>Ham Değer: <strong>{feature.value}</strong></span>
          <span>
            SHAP Katkısı:{" "}
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

  // Kazanma olasiligi modelinin one cikan en onemli 5 sebebi
  const winTop5 = useMemo(() => {
    const list: FeatureImpact[] = explanation?.win_probability?.features ?? [];
    return [...list]
      .filter((f) => Math.abs(f.contribution) > 0.0001)
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
      .filter((f) => Math.abs(f.contribution) > 0.0001)
      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
      .slice(0, 5);
  }, [explanation]);

  const activeFeatures = activeTab === "win" ? winTop5 : scoreTop5;

  const totalImpact = useMemo(() => {
    return activeFeatures.reduce((sum, f) => sum + Math.abs(f.contribution), 0) || 1;
  }, [activeFeatures]);

  const maxImpact = useMemo(() => {
    return Math.max(...activeFeatures.map((f) => Math.abs(f.contribution)), 0.0001);
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
        awayInfo
      )
    : null;

  const top2Insight = activeFeatures[1]
    ? formatFeatureInsight(
        activeFeatures[1].feature_name,
        activeFeatures[1].value,
        activeFeatures[1].influence ?? "NEUTRAL",
        homeInfo,
        awayInfo
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
            <Trophy size={13} />
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
              <Zap size={13} />
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
          {showTechDetails ? <EyeOff size={13} /> : <Eye size={13} />}
          <span>{showTechDetails ? "Teknik Değerleri Gizle" : "Teknik Verileri Göster"}</span>
        </button>
      </div>

      {/* 3. Tam 5 Tane Öne Çıkan Sebep Kartı */}
      <div className="space-y-3">
        {activeFeatures.map((feature, index) => (
          <ReasonCard
            key={`${feature.feature_name}-${index}`}
            feature={feature}
            rank={index + 1}
            maxImpact={maxImpact}
            totalImpact={totalImpact}
            homeInfo={homeInfo}
            awayInfo={awayInfo}
            showTech={showTechDetails}
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
