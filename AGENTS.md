# nbaModelApp — Unified Agent Guide

NBA game & player ML prediction platform: Python 3.12 analytical data pipeline, FastAPI inference/store service (`src/`), and React 19 / TypeScript / Tailwind frontend (`frontend/`). Single source of truth for all AI agents (`CLAUDE.md`, `GEMINI.md`, `CODEX.md` point here).

## Commands
- **Start all:** `./scripts/start_all.sh` (FastAPI `127.0.0.1:8001`, Vite `localhost:5173`; API only: `.venv/bin/python -m uvicorn src.api.main:app --host 127.0.0.1 --port 8001`).
- **Daily update & store:** `PYTHONPATH=. python3 main.py --update-data` | `PYTHONPATH=. python3 scripts/build_frontend_store.py`.
- **Paper trading & reports:** `PYTHONPATH=. python3 scripts/paper_trading_snapshot.py --season 2026-27` | `PYTHONPATH=. python3 scripts/paper_ledger_report.py --season 2026-27` | `PYTHONPATH=. python3 scripts/refresh_reports.py`.
- **Walk-forward benchmark:** `PYTHONPATH=. python3 scripts/walk_forward_benchmark.py`.
- **Tests & audits:** `PYTHONPATH=. python3 -m pytest tests -q` | `PYTHONPATH=. python3 scripts/audit/validate_project_structure.py`.
- **Frontend:** `cd frontend && npm run dev | lint:design | lint | build`.
- **Verify:** `./scripts/verify.sh` = `python3 scripts/check_no_emoji.py` + `python3 scripts/check_docs.py` + `python3 scripts/check_api_endpoints.py` + `pytest tests/test_docs_consistency.py -q` + frontend `lint:design`, `lint` & `build`.

## Skills (`.agents/skills/`, symlinked as `.claude/skills`)
Load the matching skill before modifying code.

| Touching | Skill |
|---|---|
| Model experiments, feature ablations, walk-forward backtests, calibration, promotions | `quant-model-experiment-and-audit` |
| Data ingestion, ETL, early-season priors, SQLite frontend store, paper trading ledger | `sports-pipeline-and-paper-trading` |
| Any doc, README, report, skill or `AGENTS.md` edit | `docs-drift-audit` |
| Frontend UI component, view, chart, table or style | `restrained-ui-design-standard` |

## Active Production Models (`v15`)
Release `v15` (`config/production_artifacts.yaml`; every `*_metadata.json` carries the same version):
- `win_model.pkl` (11 features, uncalibrated Logistic Regression: Elo diff, rest, B2B, clean net rating, `ABS_DIFF`, `MISSING_ROT_MINS_DIFF`, `ROT_CONTINUITY_DIFF`, `ACTIVE_WT_GS_DIFF`).
- `score_model_*.pkl` (Ridge pace on 2 features, home/away offensive rating on 4 features each, 11-feature margin model, and temporal OOF residual corrections; actual-point targets).
- `player_model_*.pkl` (24 features, LightGBM with unified L1 median objectives across PTS, REB, AST; position flags, opponent allowances, team rotation context).

## Invariants
- **Zero emoji** in code, comments, docstrings, UI text, reports, and git commits. Use `lucide-react` icons.
- **Pre-game leakage boundary (`shift(1)`):** All rolling, EWMA, Elo, allowance, and availability features must use only prior games; 100% train-serve parity across offline builders (`src/features/`) and live inference (`src/api/services/`, `src/inference/`).
- **Locked season `2026-27`:** Strictly for prospective paper-trading evaluation; never train, tune hyperparameters, or select features on it.
- **Production safety:** Never overwrite `models/production/*` or `config/production_artifacts.yaml` silently; write experiments to `models/experimental/`, `data/experimental/`, or `reports/backtests/`.
- **One home per fact:** Module rules live in `src/<module>/README.md` and `frontend/src/<module>/README.md`; cross-module guides and registries live in `docs/`; generated and frozen evaluations live in `reports/`. Generated blocks (`<!-- BEGIN GENERATED: ... -->`) are rewritten only by `scripts/refresh_reports.py`.
- **Never read:** raw `.csv`, `.jsonl`, `.db`, `.pkl` files or `node_modules/`, `dist/`, `.venv/`, `.pytest_cache/`, `.ruff_cache/`, `__pycache__/`, `graphify-out/`, `.git/`. Inspect schemas with `head -n 5` or `sqlite3 data/frontend_store/season_2025_26.db "SELECT ... LIMIT 5;"`.

## Project Map & Risk Tiers
| Group | Modules | Risk |
|---|---|---|
| Modeling & Inference | `features`, `training`, `inference`, `evaluation` | High |
| Data & Storage | `ingestion`, `processing`, `validation`, `frontend_store`, `analysis` | High |
| Serving & Orchestration | `api`, `orchestration`, `core` | Medium |
| Frontend (`frontend/src/`) | `api`, `components`, `lib`, `context`, `i18n`, `types` | Medium |

## Where to Look
1. **Module hub first:** `src/<module>/README.md` (frontend: `frontend/src/<module>/README.md` and `frontend/README.md`).
2. **Cross-module guides, registries & model specs:** `docs/README.md` (`docs/artifact_registry.md`, `docs/project_status.md`, `docs/reports/models/*.md`).
3. **Generated & frozen evaluation records:** `reports/README.md`.
