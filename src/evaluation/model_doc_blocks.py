"""Current walk-forward figures written into each model's hand-written spec.

The model docs under ``docs/reports/models/`` mix design notes (hand-written) with
numbers. The numbers go stale on every retrain, so they live between two markers and are
rewritten from ``multi_season_walk_forward_backtest.json`` by
``scripts/walk_forward_benchmark.py``; everything outside the markers is left alone.
"""
from __future__ import annotations

import re
from pathlib import Path

from src.evaluation.bootstrap import verdict

BEGIN = "<!-- BEGIN GENERATED: walk-forward (scripts/walk_forward_benchmark.py; do not edit) -->"
END = "<!-- END GENERATED: walk-forward -->"
MODEL_DOCS = {
    "win": "docs/reports/models/win_probability_model.md",
    "score": "docs/reports/models/score_model.md",
    "player": "docs/reports/models/player_props_model.md",
}
_BLOCK = re.compile(re.escape(BEGIN) + r".*?" + re.escape(END), re.S)


def _header(summary: dict, family: str) -> str:
    prov = summary.get("provenance", {})
    version = prov.get(family, {}).get("version", "?")
    return (
        f"## Güncel Walk-Forward Sonuçları (`{version}`)\n\n"
        f"Kaynak: `reports/evaluation/multi_season_walk_forward_backtest.json` "
        f"(üretim: {summary.get('timestamp', '?')}, commit `{prov.get('git_commit', '?')}`). "
        f"{summary.get('folds_evaluated', 0)} genişleyen pencere sezonu, "
        f"{summary.get('total_unseen_games', 0):,} görülmemiş maç."
    )


def _ci_line(name: str, ci: dict | None, digits: int) -> str:
    if not ci:
        return f"- {name}: yetersiz veri"
    return (f"- {name}: ortalama fark {ci['mean_diff']:+.{digits}f}, %95 CI "
            f"[{ci['ci_low']:+.{digits}f}, {ci['ci_high']:+.{digits}f}] -> {verdict(ci)}")


def _win(summary: dict) -> str:
    rows = ["| Sezon | Maç | Model Brier | Elo Brier | Fark | Model Log-Loss | Elo Log-Loss | AUC | Doğruluk |",
            "|---|---:|---:|---:|---:|---:|---:|---:|---:|"]
    won = 0
    for f in summary["folds"]:
        m, e = f["win"]["production"], f["win"]["pregame_elo"]
        won += m["brier"] < e["brier"]
        rows.append(f"| {f['test_season']} | {f['test_games']:,} | {m['brier']:.4f} | {e['brier']:.4f} | "
                    f"{m['brier'] - e['brier']:+.4f} | {m['log_loss']:.4f} | {e['log_loss']:.4f} | "
                    f"{m['roc_auc']:.4f} | {m['accuracy']:.2%} |")
    a = summary["aggregate_win"]
    rows.append(f"| **Toplam** | **{summary['total_unseen_games']:,}** | **{a['production_brier']:.4f}** | "
                f"**{a['elo_brier']:.4f}** | **{a['production_brier'] - a['elo_brier']:+.4f}** | - | - | "
                f"**{a['production_auc']:.4f}** | **{a['production_accuracy']:.2%}** |")
    sig = summary.get("significance_vs_baseline", {})
    return "\n".join([
        "\n".join(rows), "",
        f"Model, saf Elo'dan (ev sahibi avantajlı) {won}/{len(summary['folds'])} sezonda daha düşük Brier verdi.",
        _ci_line("Brier, model eksi Elo (tarih blok bootstrap)", sig.get("win_brier"), 4),
    ])


def _score(summary: dict) -> str:
    rows = ["| Sezon | Maç | Toplam MAE | Son-10 Toplam MAE | Fark MAE | Son-10 Fark MAE | %80 Kapsama (toplam / fark) |",
            "|---|---:|---:|---:|---:|---:|---:|"]
    won_t = won_m = 0
    for f in summary["folds"]:
        m, b = f["score"]["model"], f["score"]["rolling_baseline"]
        won_t += m["total_mae"] < b["total_mae"]
        won_m += m["margin_mae"] < b["margin_mae"]
        rows.append(f"| {f['test_season']} | {f['test_games']:,} | {m['total_mae']:.2f} | {b['total_mae']:.2f} | "
                    f"{m['margin_mae']:.2f} | {b['margin_mae']:.2f} | "
                    f"%{m.get('conformal_80_total_coverage', float('nan')):.1f} / "
                    f"%{m.get('conformal_80_margin_coverage', float('nan')):.1f} |")
    a = summary["aggregate_score"]
    rows.append(f"| **Ortalama** | **{summary['total_unseen_games']:,}** | **{a['model_total_mae']:.2f}** | "
                f"**{a['baseline_total_mae']:.2f}** | **{a['model_margin_mae']:.2f}** | "
                f"**{a['baseline_margin_mae']:.2f}** | **%{a['average_conformal_80_coverage']:.1f}** (toplam) |")
    sig = summary.get("significance_vs_baseline", {})
    n = len(summary["folds"])
    return "\n".join([
        "\n".join(rows), "",
        f"Son-10 baseline'ı toplamda {won_t}/{n}, farkta {won_m}/{n} sezonda geçildi. "
        "Toplam, ham pace x reyting tahminidir; üretimdeki temporal OOF artık düzeltmesi bu benchmark'ta yoktur.",
        _ci_line("Toplam MAE, model eksi son-10", sig.get("score_total"), 3),
        _ci_line("Fark MAE, model eksi son-10", sig.get("score_margin"), 3),
    ])


def _player(summary: dict) -> str:
    stats = ("pts", "reb", "ast")
    rows = ["| Sezon | Satır | " + " | ".join(f"{s.upper()} MAE (EMA-10)" for s in stats) + " |",
            "|---|---:|" + "---:|" * len(stats)]
    for f in summary["folds"]:
        p = f["player"]
        cells = " | ".join(f"{p[s]['model_mae']:.3f} ({p[s]['baseline_mae']:.3f})" for s in stats)
        rows.append(f"| {f['test_season']} | {p['pts']['samples']:,} | {cells} |")
    a = summary["aggregate_player"]
    cells = " | ".join(f"**{a[s]['model_mae']:.3f}** ({a[s]['baseline_mae']:.3f})" for s in stats)
    rows.append(f"| **Toplam** | **{a['pts']['total_samples']:,}** | {cells} |")
    won = {s: sum(f["player"][s]["model_mae"] < f["player"][s]["baseline_mae"] for f in summary["folds"])
           for s in stats}
    n = len(summary["folds"])
    return "\n".join([
        "\n".join(rows), "",
        "EMA-10 baseline'ı geçilen sezon sayısı: " + ", ".join(f"{s.upper()} {won[s]}/{n}" for s in stats) + ".",
    ])


_RENDER = {"win": _win, "score": _score, "player": _player}


def render_block(summary: dict, family: str) -> str:
    return f"{BEGIN}\n{_header(summary, family)}\n\n{_RENDER[family](summary)}\n{END}"


def apply_block(text: str, block: str) -> str:
    """Replace the generated block, or insert it before the first ``---`` rule after the header."""
    if _BLOCK.search(text):
        return _BLOCK.sub(lambda _: block, text, count=1)
    marker = "\n---\n"
    i = text.find(marker)
    if i < 0:
        return text.rstrip() + "\n\n" + block + "\n"
    return text[:i] + "\n\n" + block + "\n" + text[i:]


def update_model_docs(summary: dict, root: Path) -> list[Path]:
    written = []
    for family, rel in MODEL_DOCS.items():
        path = root / rel
        new = apply_block(path.read_text(), render_block(summary, family))
        if new != path.read_text():
            path.write_text(new)
            written.append(path)
    return written
