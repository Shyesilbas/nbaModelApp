import { reportStampText } from "../../lib/injuryTime";
import { useLanguage } from "../../context/LanguageContext";

interface InjuryReportStampProps {
  published: string | null | undefined;
  /** "used" for a finished prediction, "latest" for the report that would be used now */
  mode: "used" | "latest";
}

/** Which official injury report a prediction is (or would be) based on. */
export function InjuryReportStamp({ published, mode }: InjuryReportStampProps) {
  const { language } = useLanguage();

  if (!published) {
    return (
      <p className="text-xs text-text-secondary">
        {mode === "used"
          ? (language === "tr"
              ? "Bu tahminde resmi sakatlık raporu kullanılmadı; kadro durumu son maçlardan varsayıldı."
              : "No official injury report was filed for this prediction; rosters were inferred from recent games.")
          : (language === "tr"
              ? "Bu maç için henüz resmi sakatlık raporu yok."
              : "No official injury report filed yet for this matchup.")}
      </p>
    );
  }
  return (
    <p className="text-xs text-text-secondary">
      {mode === "used"
        ? (language === "tr" ? "Bu tahmin, resmi sakatlık raporunun " : "Prediction generated from injury report: ")
        : (language === "tr" ? "Tahmin çalıştırılırsa şu rapor baz alınır: " : "If executed now, this prediction will use report: ")}
      <span className="font-medium text-text-primary">{reportStampText(published)}</span>
      {mode === "used" ? (language === "tr" ? " sürümüne göre yapıldı." : "") : "."}
    </p>
  );
}
