import { reportStampText } from "../../lib/injuryTime";

interface InjuryReportStampProps {
  published: string | null | undefined;
  /** "used" for a finished prediction, "latest" for the report that would be used now */
  mode: "used" | "latest";
}

/** Which official injury report a prediction is (or would be) based on. */
export function InjuryReportStamp({ published, mode }: InjuryReportStampProps) {
  if (!published) {
    return (
      <p className="text-xs text-text-secondary">
        {mode === "used"
          ? "Bu tahminde resmi sakatlık raporu kullanılmadı; kadro durumu son maçlardan varsayıldı."
          : "Bu maç için henüz resmi sakatlık raporu yok."}
      </p>
    );
  }
  return (
    <p className="text-xs text-text-secondary">
      {mode === "used"
        ? "Bu tahmin, resmi sakatlık raporunun "
        : "Tahmin çalıştırılırsa şu rapor baz alınır: "}
      <span className="font-medium text-text-primary">{reportStampText(published)}</span>
      {mode === "used" ? " sürümüne göre yapıldı." : "."}
    </p>
  );
}
