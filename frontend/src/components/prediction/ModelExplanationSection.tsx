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
      return <Trophy size={14} className="text-amber-500" />;
    case "zap":
      return <Zap size={14} className="text-indigo-500" />;
    case "clock":
      return <Clock size={14} className="text-emerald-500" />;
    case "home":
      return <Home size={14} className="text-sky-500" />;
    case "target":
      return <Target size={14} className="text-rose-500" />;
    case "shield":
      return <Shield size={14} className="text-blue-500" />;
    case "scale":
      return <Scale size={14} className="text-purple-500" />;
    default:
      return <Activity size={14} className="text-slate-500" />;
  }
}

// Sıraya gore etki derecesi rozeti
function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200/80 px-2.5 py-0.5 text-[10px] font-black text-amber-700 uppercase tracking-wide">
        En Belirleyici Faktör
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-200/80 px-2.5 py-0.5 text-[10px] font-bold text-indigo-700">
        Çok Yüksek Etki
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 border border-sky-200/80 px-2.5 py-0.5 text-[10px] font-bold text-sky-700">
        Yüksek Etki
      </span>
    );
  }
  if (rank === 4) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
        Önemli Katkı
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2.5 py-0.5 text-[10px] font-bold text-slate-600">
      Destekleyici Faktör
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
      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500">
        Dengeli / Nötr
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wider shadow-xs"
      style={{
        color: team.color,
        backgroundColor: `${team.color}14`,
        borderColor: `${team.color}33`,
        borderWidth: "1px",
      }}
    >
      {isHome ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
      {team.name} ({team.abbr}) Lehine
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

  // Rank numara stilleri
  const rankColors = [
    "bg-amber-500 text-white shadow-amber-500/20",
    "bg-indigo-600 text-white shadow-indigo-500/20",
    "bg-sky-600 text-white shadow-sky-500/20",
    "bg-emerald-600 text-white shadow-emerald-500/20",
    "bg-slate-700 text-white shadow-slate-500/20",
  ];

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs transition-all hover:border-slate-300 hover:shadow-md">
      {/* Sol kenar renk vurgusu */}
      <div
        className="absolute top-0 bottom-0 left-0 w-1.5"
        style={{ backgroundColor: team?.color || "#6366f1" }}
      />

      {/* Kart Ust Baslik Alani */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-xl text-xs font-black shadow-sm ${
              rankColors[rank - 1] || "bg-slate-700 text-white"
            }`}
          >
            {rank}
          </div>
          <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
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
      <div className="pt-3">
        <h4 className="m-0 text-sm sm:text-base font-extrabold text-slate-900 tracking-tight">
          {formatted.title}
        </h4>
        <p className="mt-1.5 mb-0 text-xs sm:text-sm leading-relaxed text-slate-600">
          {formatted.insight}
        </p>
      </div>

      {/* Sade Gorsel Etki Cubugu ve Ozet Veri */}
      <div className="mt-4 pt-3 border-t border-slate-100/80">
        <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-500 mb-1.5">
          <span>Model Ağırlık Seviyesi</span>
          <span className="font-bold text-slate-700">
            {formatted.simpleValue ? `Ölçülen: ${formatted.simpleValue}` : `%${share.toFixed(0)} Model Payı`}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${relativePercent}%`,
              backgroundColor: team?.color || "#4f46e5",
            }}
          />
        </div>
      </div>

      {/* Teknik Detay Alani (Sadece acildiginda gorunur) */}
      {showTech && (
        <div className="mt-3 rounded-lg bg-slate-50 p-2.5 text-[10px] text-slate-500 flex flex-wrap items-center justify-between gap-2 font-mono">
          <span>Değişken: <strong>{feature.feature_name}</strong></span>
          <span>Ham Değer: <strong>{feature.value}</strong></span>
          <span>SHAP Katkısı: <strong className={feature.contribution >= 0 ? "text-indigo-600" : "text-rose-600"}>{feature.contribution >= 0 ? "+" : ""}{feature.contribution.toFixed(4)}</strong></span>
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
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 mb-3">
          <Info size={22} />
        </div>
        <h3 className="m-0 text-sm font-bold text-slate-800">Model açıklaması bulunamadı</h3>
        <p className="mt-1 mb-0 text-xs leading-relaxed text-slate-500">
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
      {/* ── 1. Sade ve Şık Başlık Banner'ı ── */}
      <header className="rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-5 text-white shadow-sm border border-slate-800/80">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-indigo-300 ring-1 ring-white/20">
              <Sparkles size={20} />
            </span>
            <div>
              <h3 className="m-0 text-base font-black tracking-tight text-white">
                Modelin Karar Gerekçeleri
              </h3>
              <p className="mt-1 mb-0 text-xs leading-relaxed text-slate-300">
                Yapay zekanın bu maçı değerlendirirken en çok ağırlık verdiği ve tercihi belirleyen <strong>5 temel neden</strong>:
              </p>
            </div>
          </div>

          {winnerName && (
            <div
              className="inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-black uppercase tracking-wider shadow-sm"
              style={{
                backgroundColor: `${favoredTeam.color}22`,
                color: "#ffffff",
                border: `1px solid ${favoredTeam.color}55`,
              }}
            >
              <span>Favori:</span>
              <span className="text-white underline decoration-2 underline-offset-4">
                {favoredTeam.name}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* ── 2. Sekme Seçici (Kazanma vs Skor) ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div
          role="tablist"
          aria-label="Sebep kategorileri"
          className="inline-flex rounded-xl border border-slate-200 bg-slate-100/90 p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "win"}
            onClick={() => setActiveTab("win")}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
              activeTab === "win"
                ? "bg-white text-indigo-700 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
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
              className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
                activeTab === "score"
                  ? "bg-white text-indigo-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Zap size={13} />
              <span>Skor ve Sayı Beklentisi (5 Sebep)</span>
            </button>
          )}
        </div>

        {/* Teknik Değerleri Göster / Gizle Butonu */}
        <button
          type="button"
          onClick={() => setShowTechDetails((prev) => !prev)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 hover:border-slate-300 hover:text-slate-800 transition-colors shadow-2xs"
        >
          {showTechDetails ? <EyeOff size={13} /> : <Eye size={13} />}
          <span>{showTechDetails ? "Teknik Değerleri Gizle" : "Teknik Verileri Göster"}</span>
        </button>
      </div>

      {/* ── 3. Tam 5 Tane Öne Çıkan Sebep Kartı ── */}
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

      {/* ── 4. Herkesin Anlayacağı Özet Değerlendirme Kutusu ── */}
      {top1Insight && top2Insight && (
        <footer className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/70 to-slate-50/80 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white font-bold text-xs shadow-xs">
              💡
            </span>
            <div className="min-w-0">
              <h5 className="m-0 text-xs font-extrabold uppercase tracking-wider text-indigo-900">
                Genel Değerlendirme
              </h5>
              <p className="mt-1 mb-0 text-xs sm:text-sm leading-relaxed text-slate-700">
                Modelimiz bu karşılaşmada özellikle <strong>{favoredTeam.name}</strong> lehine olan{" "}
                <strong className="text-indigo-900">{top1Insight.title}</strong> ve{" "}
                <strong className="text-indigo-900">{top2Insight.title}</strong> avantajları sayesinde
                bu takımın galibiyete daha yakın olduğunu değerlendirmektedir.
              </p>
            </div>
          </div>
        </footer>
      )}
    </section>
  );
}
