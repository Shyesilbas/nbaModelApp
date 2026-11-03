"""Headline figures of PROJECT_STATUS.md and README.md, rendered from the generated reports.

The hand-written docs carry numbers that go stale on every benchmark run or ledger update. Those
numbers live between ``<!-- BEGIN GENERATED: <name> -->`` markers and are rewritten from
``multi_season_walk_forward_backtest.json`` and ``paper_ledger_<season>.json`` by
``scripts/refresh_reports.py``; everything outside the markers is left alone.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from src.core.season_utils import season_to_file_token
from src.evaluation.bootstrap import verdict

WALK_FORWARD_JSON = "reports/evaluation/multi_season_walk_forward_backtest.json"
LEDGER_SEASON = "2026-27"
LEDGER_MIN_GAMES = 300  # below this the live sample cannot separate the model from Elo

WIN_DESC = ("Logistic regression on 11 features (Elo diff, home, clean net rating diff, win-rate diff, rest diff, "
            "back-to-backs, ABS_DIFF, missing rotation minutes, rotation continuity, active lineup Game Score), "
            "early-season Elo blend")
SCORE_DESC = ("Ridge pace (2 features) and offensive-rating models (4 features each), Ridge margin on the WIN inputs, "
              "Ridge residual correction; actual-point targets")
PLAYER_DESC = ("LightGBM per target (L1 median objectives), 24 features incl. opponent allowance to the player's "
               "position and team rotation context")
PLAYER_TARGETS = ("pts", "reb", "ast")


def _markers(name: str) -> tuple[str, str]:
    return (f"<!-- BEGIN GENERATED: {name} (scripts/refresh_reports.py; do not edit) -->",
            f"<!-- END GENERATED: {name} -->")


def apply_named_block(text: str, name: str, body: str) -> str:
    begin, end = _markers(name)
    pattern = re.compile(re.escape(f"<!-- BEGIN GENERATED: {name}") + r".*?" + re.escape(end), re.S)
    if not pattern.search(text):
        raise ValueError(f"missing generated block markers for '{name}'")
    return pattern.sub(lambda _: f"{begin}\n{body.strip()}\n{end}", text, count=1)


def _sig(ci: dict | None) -> str:
    return "n/a" if not ci else f"{ci['mean_diff']:+.4f}, 95% CI [{ci['ci_low']:+.4f}, {ci['ci_high']:+.4f}]"


def _significant(ci: dict | None) -> bool:
    return bool(ci) and ci["ci_high"] < 0


def readme_table(wf: dict) -> str:
    version = wf["provenance"]["win"]["version"]
    last = wf["folds"][-1]
    w, s, p = last["win"]["production"], last["score"]["model"], last["player"]
    aw, as_, ap = wf["aggregate_win"], wf["aggregate_score"], wf["aggregate_player"]
    sig = wf["significance_vs_baseline"]
    train_to = last["train_seasons"][-1]
    first_train = last["train_seasons"][0]
    seasons = f"{wf['folds'][0]['test_season']}..{last['test_season']}"
    total_sig = "significant" if _significant(sig.get("score_total")) else "not significant"
    return "\n".join([
        f"| Layer | Model | Walk-forward {last['test_season']} (trained on {first_train}..{train_to} only) | "
        f"{len(wf['folds'])}-season walk-forward ({seasons}, {wf['total_unseen_games']:,} games) |",
        "| :--- | :--- | :--- | :--- |",
        f"| **WIN Probability ({version})** | {WIN_DESC} | ROC-AUC `{w['roc_auc']:.3f}`, Brier `{w['brier']:.3f}`, "
        f"Log-loss `{w['log_loss']:.3f}`, Accuracy `{w['accuracy']:.1%}` ({w['samples']:,} games) | "
        f"ROC-AUC `{aw['production_auc']:.3f}`, Brier `{aw['production_brier']:.4f}` (Elo `{aw['elo_brier']:.4f}`), "
        f"Accuracy `{aw['production_accuracy']:.1%}` |",
        f"| **SCORE Prediction ({version})** | {SCORE_DESC} | Total MAE `{s['total_mae']:.2f}`, "
        f"Margin MAE `{s['margin_mae']:.2f}` | Total MAE `{as_['model_total_mae']:.2f}` "
        f"(last-10 `{as_['baseline_total_mae']:.2f}`, {total_sig}), Margin MAE `{as_['model_margin_mae']:.2f}` "
        f"(last-10 `{as_['baseline_margin_mae']:.2f}`) |",
        f"| **PLAYER Projection ({version})** | {PLAYER_DESC} | MAE PTS `{p['pts']['model_mae']:.2f}`, "
        f"REB `{p['reb']['model_mae']:.2f}`, AST `{p['ast']['model_mae']:.2f}` ({p['pts']['samples']:,} rows) | "
        f"MAE PTS `{ap['pts']['model_mae']:.2f}`, REB `{ap['reb']['model_mae']:.2f}`, AST `{ap['ast']['model_mae']:.2f}` "
        f"(EMA-10 `{ap['pts']['baseline_mae']:.2f}` / `{ap['reb']['baseline_mae']:.2f}` / `{ap['ast']['baseline_mae']:.2f}`) |",
    ])


def readme_significance(wf: dict) -> str:
    sig = wf["significance_vs_baseline"]
    n = len(wf["folds"])
    live = wf.get("win_availability_audit", {})
    live_text = ""
    if "live_like_serve" in live and sig.get("win_brier_live_like"):
        ci = sig["win_brier_live_like"]
        live_text = (
            f" Training and backtest take the four roster-availability features from each game's own box score, "
            f"which live serving only approximates; with the live default (whoever played the previous game plays, "
            f"no injury report) the WIN gain over Elo shrinks to `{ci['mean_diff']:+.4f}` "
            f"(95% CI `[{ci['ci_low']:+.4f}, {ci['ci_high']:+.4f}]`)."
        )
    ci_w, ci_m, ci_t = sig["win_brier"], sig["score_margin"], sig["score_total"]
    total_word = "is significant" if _significant(ci_t) else "is not significant (CI includes 0)"
    return (
        f"Against simple pregame baselines over {n} walk-forward seasons the WIN Brier gain over Elo + home court "
        f"(`{ci_w['mean_diff']:+.4f}`, 95% CI `[{ci_w['ci_low']:+.4f}, {ci_w['ci_high']:+.4f}]`) and the margin gain "
        f"over last-10 points (`{ci_m['mean_diff']:+.2f}`) {'are' if _significant(ci_w) and _significant(ci_m) else 'are not both'} "
        f"significant; the total-points gain (`{ci_t['mean_diff']:+.2f}`) {total_word}.{live_text} "
        "The game-level models sit close to what pregame data allows; larger gains need new information."
    )


def status_walk_forward(wf: dict) -> str:
    aw, as_, ap = wf["aggregate_win"], wf["aggregate_score"], wf["aggregate_player"]
    sig, audit = wf["significance_vs_baseline"], wf.get("win_availability_audit", {})
    day = wf["timestamp"][:10]
    folds = wf["folds"]
    won = sum(f["win"]["production"]["brier"] < f["win"]["pregame_elo"]["brier"] for f in folds)
    seasons = f"`{folds[0]['test_season']}` to `{folds[-1]['test_season']}`"
    ci_w, ci_t, ci_m = sig["win_brier"], sig["score_total"], sig["score_margin"]
    lines = [
        f"Expanding walk-forward evaluation across {len(folds)} unseen seasons ({seasons}), generated {day} by "
        "`scripts/walk_forward_benchmark.py` (`reports/evaluation/multi_season_walk_forward_backtest.md`; "
        "CI = date-block bootstrap 95%):",
        f"- **WIN**: Brier **`{aw['production_brier']:.4f}`** (vs Elo baseline `{aw['elo_brier']:.4f}`, CI of the "
        f"difference `[{ci_w['ci_low']:+.4f}, {ci_w['ci_high']:+.4f}]`, {won}/{len(folds)} seasons), ROC-AUC "
        f"**`{aw['production_auc']:.4f}`**, Accuracy **`{aw['production_accuracy']:.2%}`** "
        f"({wf['total_unseen_games']:,} games). ECE `{wf['win_reliability']['ece']:.4f}`.",
    ]
    live = sig.get("win_brier_live_like")
    if live and "live_like_retrain" in audit:
        lines.append(
            "- **WIN, live-like availability**: training and backtest build the four roster features "
            "(`ABS_DIFF`, `MISSING_ROT_MINS_DIFF`, `ROT_CONTINUITY_DIFF`, `ACTIVE_WT_GS_DIFF`) from each game's own box "
            "score, while live serving only has the injury report and \"whoever played the previous game plays\". With "
            f"that default and no injury report the same model scores Brier `{audit['live_like_serve']['brier']:.4f}` "
            f"(retrained on it: `{audit['live_like_retrain']['brier']:.4f}`), a gain of `{-live['mean_diff']:.4f}` over "
            f"Elo (CI `[{live['ci_low']:+.4f}, {live['ci_high']:+.4f}]`) instead of `{-ci_w['mean_diff']:.4f}`; without "
            f"the four features `{audit['no_availability']['brier']:.4f}`. The injury report adds some of the remaining "
            "gap live. Section 4 of the walk-forward report.")
    lines.append(
        f"- **SCORE** (production pipeline incl. OOF residual correction, per-fold conformal radii): Total MAE "
        f"**`{as_['model_total_mae']:.2f} pts`** (vs last-10 `{as_['baseline_total_mae']:.2f} pts`, CI "
        f"`[{ci_t['ci_low']:+.3f}, {ci_t['ci_high']:+.3f}]`{'' if _significant(ci_t) else ': not significant'}), "
        f"Margin MAE **`{as_['model_margin_mae']:.2f} pts`** (vs last-10 `{as_['baseline_margin_mae']:.2f} pts`, CI "
        f"`[{ci_m['ci_low']:+.3f}, {ci_m['ci_high']:+.3f}]`), Conformal 80% coverage "
        f"**`{as_['average_conformal_80_coverage']:.1f}%`** total / **`{as_['average_conformal_80_margin_coverage']:.1f}%`** "
        f"margin, radii learned only from each fold's training seasons. The raw ridge outputs (no correction) score "
        f"`{as_['raw_total_mae']:.2f}` / `{as_['raw_margin_mae']:.2f}`.")
    pc = {t: sig.get(f"player_{t}") for t in PLAYER_TARGETS}
    lines.append(
        f"- **PLAYER**: PTS MAE **`{ap['pts']['model_mae']:.3f}`** (vs EMA-10 `{ap['pts']['baseline_mae']:.3f}`, CI of "
        f"the difference `[{pc['pts']['ci_low']:+.3f}, {pc['pts']['ci_high']:+.3f}]`), REB MAE "
        f"**`{ap['reb']['model_mae']:.3f}`** (vs EMA-10 `{ap['reb']['baseline_mae']:.3f}`), AST MAE "
        f"**`{ap['ast']['model_mae']:.3f}`** (vs EMA-10 `{ap['ast']['baseline_mae']:.3f}`) "
        f"({ap['pts']['total_samples']:,} rows).")
    return "\n".join(lines)


def status_ledger(ledger: dict) -> str:
    cur, rel = ledger["current_live"], ledger["production_release"]
    head = (f"Generated by `scripts/paper_ledger_report.py` (`reports/evaluation/paper_ledger_"
            f"{season_to_file_token(ledger['season'])}.md`) on {ledger['generated_utc'][:10]}: "
            f"{ledger['graded']} frozen predictions graded, {ledger['pending']} pending, last game "
            f"{ledger['last_game_date']}.")
    if not cur.get("games"):
        return head + f" No graded live games for `{rel}` yet."
    ci = cur.get("brier_vs_elo")
    verdict_text = verdict(ci) if ci else "no comparison"
    sample = ("Too few games to separate the model from Elo yet; "
              f"re-check after ~{LEDGER_MIN_GAMES} games." if cur["games"] < LEDGER_MIN_GAMES
              else "Enough games for a first read of the difference.")
    return (
        f"{head} `{rel}` live, {cur['games']} games: Brier `{cur['brier']:.4f}` vs pure Elo "
        f"`{cur.get('elo_brier', float('nan')):.4f}` (difference {_sig(ci)}: {verdict_text}), total MAE "
        f"`{cur['mae_total']:.2f}` vs last-10 `{cur.get('base_mae_total', float('nan')):.2f}`, margin MAE "
        f"`{cur['mae_margin']:.2f}` vs `{cur.get('base_mae_margin', float('nan')):.2f}`. {sample}")


def update_status_docs(root: Path, season: str = LEDGER_SEASON) -> list[Path]:
    """Rewrite the generated blocks of PROJECT_STATUS.md and README.md; returns the files that changed."""
    wf = json.loads((root / WALK_FORWARD_JSON).read_text())
    ledger_path = root / f"reports/evaluation/paper_ledger_{season_to_file_token(season)}.json"
    ledger = json.loads(ledger_path.read_text()) if ledger_path.exists() else None
    plan = {
        "PROJECT_STATUS.md": [("walk-forward-headline", status_walk_forward(wf))]
        + ([("ledger-headline", status_ledger(ledger))] if ledger else []),
        "README.md": [("walk-forward-table", readme_table(wf)), ("walk-forward-significance", readme_significance(wf))],
    }
    changed = []
    for rel, blocks in plan.items():
        path = root / rel
        old = text = path.read_text()
        for name, body in blocks:
            text = apply_named_block(text, name, body)
        if text != old:
            path.write_text(text)
            changed.append(path)
    return changed
