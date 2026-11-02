#!/usr/bin/env python3
"""Prospective report for the locked season's paper-trading ledger.

Grades every frozen pre-tip prediction in data/predictions/paper_ledger_<season>.jsonl against
the finished games and compares it with baselines computed from games strictly before each
game date: pure Elo (season opening Elo chained through the season's results, with home court)
for the win probability, and each side's last-10 points scored and allowed for the total and
margin. Results are split by model version and origin (live vs backfill), because a summary over
mixed releases does not describe any one model.

Writes reports/evaluation/paper_ledger_<token>.md and .json. Read-only on the ledger.

    PYTHONPATH=. python3 scripts/paper_ledger_report.py --season 2026-27
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.core.season_utils import season_to_file_token  # noqa: E402
from src.evaluation.bootstrap import verdict  # noqa: E402
from src.evaluation.paper_ledger import MIN_PRIOR_GAMES, build_report  # noqa: E402


def _fmt(x, digits=4):
    return "-" if x is None else f"{x:.{digits}f}"


def _ci_row(label: str, ci: dict | None, digits: int) -> str:
    if not ci:
        return f"| {label} | - | - | - | yetersiz veri |\n"
    return (
        f"| {label} | {ci['mean_diff']:+.{digits}f} | [{ci['ci_low']:+.{digits}f}, {ci['ci_high']:+.{digits}f}] "
        f"| %{ci['p_model_better'] * 100:.1f} | {verdict(ci)} (n={ci['n']}) |\n"
    )


def render_markdown(rep: dict) -> str:
    cur = rep["current_live"]
    rel = rep["production_release"]
    md = f"""# Paper Trading Defteri Raporu ({rep['season']})

> Bu dosya `scripts/paper_ledger_report.py` tarafından üretilir; elle düzenlenmez.
> Kilitli sezon: yalnızca prospektif izleme. Bu sonuçlar model seçimi veya ayar için kullanılmaz.

**Rapor Tarihi:** {rep['generated_utc']}
**Üretim Sürümü:** `{rel}`
**Defter:** {rep['ledger_rows']} kayıt, {rep['graded']} sonuçlanmış ve geçerli, {rep['pending']} bekleyen, {rep['invalid_late']} geç (tip-off sonrası, sayılmaz). Son sonuçlanan maç: {rep['last_game_date'] or '-'}

---

## 1. Güncel Sürüm, Canlı Kayıtlar (`{rel}` / live)

"""
    if not cur.get("games"):
        md += "Henüz sonuçlanmış canlı kayıt yok.\n"
    else:
        md += f"""| Metrik | Model | Baseline | Baseline |
|---|---:|---:|---|
| Maç | {cur['games']} | {cur.get('elo_games', '-')} | saf Elo eşleşen |
| Doğruluk | %{cur['accuracy'] * 100:.1f} | %{(cur.get('elo_accuracy') or 0) * 100:.1f} | saf Elo |
| Brier | {_fmt(cur['brier'])} | {_fmt(cur.get('elo_brier'))} | saf Elo |
| Log-Loss | {_fmt(cur['log_loss'])} | - | |
| Ev sahibi kazanma oranı | %{cur['home_win_rate'] * 100:.1f} | - | |
| Toplam MAE | {_fmt(cur['mae_total'], 2)} | {_fmt(cur.get('base_mae_total'), 2)} | son-10 sayı (n={cur.get('baseline_games', 0)}) |
| Margin MAE | {_fmt(cur['mae_margin'], 2)} | {_fmt(cur.get('base_mae_margin'), 2)} | son-10 sayı + ev avantajı |

Not: model MAE satırları tüm maçlar üzerindedir; baseline sütunu yalnızca iki takımın da en az {MIN_PRIOR_GAMES} önceki maçı olan alt kümede hesaplanır. Anlamlılık testi aynı alt kümede eşleştirilmiştir.

### Anlamlılık (fark = model - baseline, negatif = model daha iyi, date-block bootstrap %95)

| Karşılaştırma | Ortalama Fark | %95 CI | Model daha iyi olasılığı | Yorum |
|---|---:|---:|---:|---|
"""
        md += _ci_row("Brier vs saf Elo", cur.get("brier_vs_elo"), 4)
        md += _ci_row("Toplam MAE vs son-10", cur.get("total_vs_last10"), 2)
        md += _ci_row("Margin MAE vs son-10", cur.get("margin_vs_last10"), 2)
        md += "\n### Kalibrasyon (tahmin edilen kazananın olasılığı)\n\n| Güven Bandı | Maç | Ortalama Güven | Gerçekleşen Doğruluk |\n|---|---:|---:|---:|\n"
        for b in cur["bands"]:
            md += f"| {b['label']} | {b['games']} | %{b['mean_confidence'] * 100:.1f} | %{b['accuracy'] * 100:.1f} |\n"

    md += "\n---\n\n## 2. Sürüm ve Kaynak Bazında Döküm\n\n| Sürüm / Kaynak | Maç | Doğruluk | Brier | Elo Brier | Toplam MAE | Margin MAE |\n|---|---:|---:|---:|---:|---:|---:|\n"
    for key, s in rep["by_version"].items():
        md += f"| `{key}` | {s['games']} | %{s['accuracy'] * 100:.1f} | {_fmt(s['brier'])} | {_fmt(s.get('elo_brier'))} | {_fmt(s['mae_total'], 2)} | {_fmt(s['mae_margin'], 2)} |\n"
    a = rep["all_valid"]
    if a.get("games"):
        md += f"| **Tümü (karışık sürüm)** | {a['games']} | %{a['accuracy'] * 100:.1f} | {_fmt(a['brier'])} | {_fmt(a.get('elo_brier'))} | {_fmt(a['mae_total'], 2)} | {_fmt(a['mae_margin'], 2)} |\n"
    md += "\n`backfill` kayıtları dondurulmuş çağrı değildir (maç tarihinden önceki verilerle sonradan üretildi, sakatlık raporu yok); güncel sürümün başarısı yalnızca `live` satırlarıyla ölçülür.\n"

    if rep["weekly_current_live"]:
        md += f"\n---\n\n## 3. Haftalık Seyir (`{rel}` / live)\n\n| Hafta | Maç | Doğruluk | Brier | Elo Brier | Toplam MAE | Margin MAE |\n|---|---:|---:|---:|---:|---:|---:|\n"
        for w in rep["weekly_current_live"]:
            md += f"| {w['week']} | {w['games']} | %{w['accuracy'] * 100:.1f} | {_fmt(w['brier'])} | {_fmt(w['elo_brier'])} | {_fmt(w['mae_total'], 2)} | {_fmt(w['mae_margin'], 2)} |\n"

    md += """
---

## Okuma Notları

- Tek sezonda eşleştirilmiş MAE farkının standart hatası yaklaşık 0.09 sayıdır; 0.2 sayının altındaki farklar yüzlerce maç birikmeden doğrulanamaz. Erken sezonda CI'lar geniştir.
- Walk-forward referansı (2021-22 .. 2025-26): `reports/evaluation/multi_season_walk_forward_backtest.md`.
"""
    return md


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--season", default="2026-27")
    parser.add_argument("--stdout", action="store_true", help="Print the markdown instead of writing files")
    args = parser.parse_args()

    rep = build_report(args.season)
    md = render_markdown(rep)
    if args.stdout:
        print(md)
        return 0
    token = season_to_file_token(rep["season"])
    out_dir = ROOT / "reports" / "evaluation"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / f"paper_ledger_{token}.json").write_text(json.dumps(rep, indent=2, default=str))
    (out_dir / f"paper_ledger_{token}.md").write_text(md)
    print(f"Wrote {out_dir / f'paper_ledger_{token}.md'} ({rep['graded']} graded games)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
