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
import math
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.api.services.paper_trading import COUNTED_SEASON_TYPES, CONFIDENCE_BANDS, grade, load_results, read_ledger  # noqa: E402
from src.core.artifact_paths import production_release  # noqa: E402
from src.core.data_paths import get_data_paths  # noqa: E402
from src.core.season_utils import normalize_season, season_to_file_token  # noqa: E402
from src.evaluation.bootstrap import paired_block_bootstrap, verdict  # noqa: E402
from src.features.continuous_elo import ContinuousEloEngine  # noqa: E402
from src.features.win_strength_features import season_opening_ratings  # noqa: E402
from src.processing.season_type_normalizer import drop_preseason  # noqa: E402

MIN_PRIOR_GAMES = 3  # last-10 baseline needs at least this many earlier games for both teams
LAST_N = 10


def _team_games(season: str) -> pd.DataFrame:
    path = Path(get_data_paths(season).team_games_raw)
    if not path.exists():
        return pd.DataFrame()
    df = pd.read_csv(path, dtype={"GAME_ID": str})
    df["GAME_ID"] = df["GAME_ID"].str.zfill(10)
    return drop_preseason(df[df["SEASON_TYPE"].isin(COUNTED_SEASON_TYPES)].dropna(subset=["PTS"]))


def elo_baseline(season: str, games: pd.DataFrame) -> dict[str, float]:
    """Pregame home-win probability from pure Elo for every finished game of the season."""
    if games.empty:
        return {}
    engine = ContinuousEloEngine(initial_ratings=season_opening_ratings(season) or None)
    out = engine.transform_games(games)
    home = out[out["IS_HOME"].astype(bool)]
    return dict(zip(home["GAME_ID"].astype(str).str.zfill(10), home["ELO_EXPECTED_WIN_PROB"].astype(float)))


def _previous_season(season: str) -> str:
    start = int(season[:4]) - 1
    return f"{start}-{str(start + 1)[-2:]}"


def home_edge(season: str) -> float:
    """Mean home margin of the previous season's games: the constant of the last-10 margin baseline."""
    prev = _team_games(_previous_season(season))
    home = prev[prev["MATCHUP"].str.contains("vs.", regex=False)]
    return float(home["PLUS_MINUS"].mean()) if not home.empty else 0.0


def last10_baseline(games: pd.DataFrame, edge: float) -> dict[str, dict[str, float]]:
    """Total and margin from both teams' last-10 points scored and allowed, earlier dates only."""
    if games.empty:
        return {}
    df = games[["GAME_ID", "GAME_DATE", "TEAM_ABBREVIATION", "MATCHUP", "PTS", "PLUS_MINUS"]].copy()
    df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"])
    df["OPP_PTS"] = df["PTS"] - df["PLUS_MINUS"]
    df = df.sort_values(["TEAM_ABBREVIATION", "GAME_DATE", "GAME_ID"])
    grp = df.groupby("TEAM_ABBREVIATION")
    df["PTS_L10"] = grp["PTS"].transform(lambda s: s.shift(1).rolling(LAST_N, min_periods=1).mean())
    df["ALLOWED_L10"] = grp["OPP_PTS"].transform(lambda s: s.shift(1).rolling(LAST_N, min_periods=1).mean())
    df["PRIOR"] = grp.cumcount()
    home = df[df["MATCHUP"].str.contains("vs.", regex=False)].set_index("GAME_ID")
    away = df[df["MATCHUP"].str.contains("@", regex=False)].set_index("GAME_ID")
    both = home.join(away, lsuffix="_H", rsuffix="_A", how="inner")
    both = both[(both["PRIOR_H"] >= MIN_PRIOR_GAMES) & (both["PRIOR_A"] >= MIN_PRIOR_GAMES)]
    total = (both["PTS_L10_H"] + both["ALLOWED_L10_H"] + both["PTS_L10_A"] + both["ALLOWED_L10_A"]) / 2.0
    margin = ((both["PTS_L10_H"] - both["ALLOWED_L10_H"]) - (both["PTS_L10_A"] - both["ALLOWED_L10_A"])) / 2.0 + edge
    return {gid: {"total": float(t), "margin": float(m)} for gid, t, m in zip(both.index, total, margin)}


def _brier(p: float, y: float) -> float:
    return (p - y) ** 2


def _log_loss(p: float, y: float) -> float:
    pc = min(max(p, 1e-6), 1 - 1e-6)
    return -(y * math.log(pc) + (1 - y) * math.log(1 - pc))


def summarize_group(rows: list[dict]) -> dict:
    n = len(rows)
    if not n:
        return {"games": 0}
    y = np.array([r["y"] for r in rows], dtype=float)
    p = np.array([r["home_win_probability"] for r in rows], dtype=float)
    out = {
        "games": n,
        "accuracy": round(float(np.mean([r["correct"] for r in rows])), 4),
        "brier": round(float(np.mean((p - y) ** 2)), 4),
        "log_loss": round(float(np.mean([_log_loss(pi, yi) for pi, yi in zip(p, y)])), 4),
        "home_win_rate": round(float(y.mean()), 4),
        "mae_total": round(float(np.mean([abs(r["predicted_total"] - r["actual_total"]) for r in rows])), 2),
        "mae_margin": round(float(np.mean([abs(r["predicted_margin"] - r["actual_margin"]) for r in rows])), 2),
    }
    elo_rows = [r for r in rows if r.get("elo_prob") is not None]
    if elo_rows:
        pe = np.array([r["elo_prob"] for r in elo_rows])
        ye = np.array([r["y"] for r in elo_rows], dtype=float)
        out["elo_games"] = len(elo_rows)
        out["elo_brier"] = round(float(np.mean((pe - ye) ** 2)), 4)
        out["elo_accuracy"] = round(float(np.mean((pe >= 0.5) == (ye == 1.0))), 4)
        out["brier_vs_elo"] = paired_block_bootstrap(
            np.array([_brier(r["home_win_probability"], r["y"]) - _brier(r["elo_prob"], r["y"]) for r in elo_rows]),
            np.array([r["game_date"] for r in elo_rows]),
        )
    base_rows = [r for r in rows if r.get("base_total") is not None]
    if base_rows:
        out["baseline_games"] = len(base_rows)
        out["base_mae_total"] = round(float(np.mean([abs(r["base_total"] - r["actual_total"]) for r in base_rows])), 2)
        out["base_mae_margin"] = round(float(np.mean([abs(r["base_margin"] - r["actual_margin"]) for r in base_rows])), 2)
        dates = np.array([r["game_date"] for r in base_rows])
        out["total_vs_last10"] = paired_block_bootstrap(
            np.array([abs(r["predicted_total"] - r["actual_total"]) - abs(r["base_total"] - r["actual_total"]) for r in base_rows]), dates
        )
        out["margin_vs_last10"] = paired_block_bootstrap(
            np.array([abs(r["predicted_margin"] - r["actual_margin"]) - abs(r["base_margin"] - r["actual_margin"]) for r in base_rows]), dates
        )
    bands = []
    for lo, hi in CONFIDENCE_BANDS:
        sub = [r for r in rows if lo <= max(r["home_win_probability"], 1 - r["home_win_probability"]) < hi]
        if sub:
            bands.append({
                "label": f"{round(lo * 100)}-{min(round(hi * 100), 100)}%",
                "games": len(sub),
                "mean_confidence": round(float(np.mean([max(r["home_win_probability"], 1 - r["home_win_probability"]) for r in sub])), 4),
                "accuracy": round(float(np.mean([r["correct"] for r in sub])), 4),
            })
    out["bands"] = bands
    return out


def build_report(season: str) -> dict:
    season = normalize_season(season)
    records = read_ledger(season)
    graded = grade(records, load_results(season))
    games = _team_games(season)
    elo = elo_baseline(season, games)
    base = last10_baseline(games, home_edge(season))

    final = []
    for g in graded:
        if g["status"] != "final" or not g["valid"]:
            continue
        row = dict(g)
        row["y"] = 1.0 if g["actual_winner"] == g["home_team"] else 0.0
        row["elo_prob"] = elo.get(g["game_id"])
        b = base.get(g["game_id"])
        row["base_total"] = b["total"] if b else None
        row["base_margin"] = b["margin"] if b else None
        final.append(row)

    release = production_release()
    groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for r in final:
        groups[(r.get("model_version") or "?", r["origin"])].append(r)
    current_live = groups.get((release, "live"), [])

    weekly = []
    if current_live:
        df = pd.DataFrame(current_live)
        df["week"] = pd.to_datetime(df["game_date"]).dt.to_period("W-SUN").dt.start_time.dt.date.astype(str)
        for week, sub in df.groupby("week"):
            rows = sub.to_dict("records")
            s = summarize_group(rows)
            weekly.append({"week": week, **{k: s.get(k) for k in ("games", "accuracy", "brier", "elo_brier", "mae_total", "mae_margin")}})

    return {
        "season": season,
        "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "production_release": release,
        "ledger_rows": len(records),
        "graded": len(final),
        "pending": sum(1 for g in graded if g["status"] == "pending"),
        "invalid_late": sum(1 for g in graded if not g["valid"]),
        "last_game_date": max((r["game_date"] for r in final), default=None),
        "current_live": summarize_group(current_live),
        "all_valid": summarize_group(final),
        "by_version": {f"{v}/{o}": summarize_group(rows) for (v, o), rows in sorted(groups.items())},
        "weekly_current_live": weekly,
    }


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
