# Project Rules

These rules apply to all future work in this workspace unless the user explicitly overrides them.

## Agent Required References (Read FIRST before any action)
Before modifying code, running models, or performing analysis, the AI assistant MUST review these documents in order:
1. `docs/artifact_registry.md` — Single source of truth for all data, model, and report paths. Never overwrite production paths listed here without explicit user approval.
2. `docs/project_status.md` — Tracks the current active phases, production model configurations, and next steps.
3. `README.md` — Core architecture overview and quick-start pipeline commands.
4. `reports/production/model_performance_and_architecture_report.md` — Production V10/V10.1 model architecture, calibration methods, and benchmark parameters.
5. `docs/season_onboarding_guide.md` — Sequence of CLI commands to ingest and bootstrap new seasons.
6. `docs/reporting_and_validation_guide.md` — How to run season freshness audits, model evaluations, and comparisons.
7. `config/production_artifacts.yaml` — Production configurations, paths, and metadata.

## Production Safety
- Production artifacts under `models/production/`, `config/production_artifacts.yaml` and the tracked season bootstrap files under `data/season=YYYY-YY/analysis/` must never be overwritten unless the user explicitly approves.

## Artifact Registry Authority
- `docs/artifact_registry.md` is the single source of truth for artifact status.
- Before using, modifying, promoting, archiving, or replacing any dataset, report, model, or metadata file, consult `docs/artifact_registry.md` first.

## Experimental Work
- New experiments must write outputs under the current experimental artifact locations tracked in `docs/artifact_registry.md`.

## Reports
- Audit and analysis reports must go under the active audit/report locations tracked in `docs/artifact_registry.md`.
- Experiment reports must be registered before they are treated as active outputs.

## Current Production Decision
- Win Probability: Win Probability V10 (Uncalibrated Logistic Regression on 7-8 features) is the active production model.
- Score Prediction: Score Prediction V10 (Standardized Ridge models for Pace, Home/Away Off_Rtg, Margin with Ridge residual correction) is the active production model.
- Player Prediction: Player Prediction V9 (LightGBM models for PTS with L1 objective, REB, AST on 21 features) is the active production model.

## Common Pipelines and CLI Commands

### Model Lifecycle Commands
- Build Player Dataset V4: `PYTHONPATH=. python3 main.py --build-player-dataset-v4`
- Train Player Models: `PYTHONPATH=. python3 main.py --train-player-models`
- Train Score Models: `PYTHONPATH=. python3 main.py --train-score-models`
- Train Win Model: `PYTHONPATH=. python3 main.py --train-win-model`
- Safe Retraining & Promotion Pipeline: `PYTHONPATH=. python3 scripts/retrain_pipeline.py --season YYYY-YY [--dry-run]`

### Daily Operations & Data Freshness
- Daily Data Update (fetches latest completed game logs): `PYTHONPATH=. python3 main.py --update-data`
- Package Frontend Schedule Context: `PYTHONPATH=. python3 main.py --build-schedule-context`
- Build Frontend Store (per-season SQLite, closed seasons skipped): `PYTHONPATH=. python3 scripts/build_frontend_store.py`
- Roster & Core Player Analysis: `PYTHONPATH=. python3 main.py --season YYYY-YY --run-roster-analysis`
- Daily Schedule Matchups Predictor: `PYTHONPATH=. python3 scripts/predict_daily_schedule.py --date YYYY-MM-DD --season YYYY-YY`

### Quality Control & Audits
- Verify Project Structure: `PYTHONPATH=. python3 scripts/audit/validate_project_structure.py`
- Verify Path Refactoring: `PYTHONPATH=. python3 scripts/audit/validate_season_path_refactor.py`
- Season & Model Report Audit: `PYTHONPATH=. python3 scripts/generate_report.py --season YYYY-YY --evaluate`
- Model Side-by-Side Comparison: `PYTHONPATH=. python3 scripts/generate_report.py --compare-models models/production models/experimental/holdout_eval --season YYYY-YY`
- Data Drift & Feature Leakage Detector: `PYTHONPATH=. python3 scripts/detect_drift_and_leakage.py --reference-season YYYY-YY --target-season YYYY-YY`

### New Season Onboarding Workflow
To fully ingest and bootstrap a new NBA season (e.g., `2020-21`), run the following commands sequentially:
1. **Bulk Ingest Raw Boxscores & Schedule**:
   `PYTHONPATH=. python3 main.py --season YYYY-YY --update-data`
2. **Discover Core Rosters & Ranks**:
   `PYTHONPATH=. python3 main.py --season YYYY-YY --run-roster-analysis`
3. **Extract Observed Trade Affiliations**:
   `PYTHONPATH=. python3 scripts/ingest/build_observed_affiliation_events.py --season YYYY-YY`
4. **Bootstrap Features & Generate Manifest**:
   `PYTHONPATH=. python3 main.py --season YYYY-YY --bootstrap-season`
5. **Run Auditing Checks**:
   `PYTHONPATH=. python3 scripts/audit/validate_project_structure.py && PYTHONPATH=. python3 scripts/audit/validate_season_path_refactor.py`

## Model Responsibility
- Winner prediction must come from the win probability model.
- Score model must only provide expected score, total, margin, and ranges.

## No Silent Training
- Do not retrain models unless the user explicitly asks.
- Never overwrite trained model files during analysis tasks.

## Promotion Rule
- Experimental artifacts must not be promoted to production unless:
  1. Validation completed.
  2. Metrics documented.
  3. Registry updated.
  4. User explicitly approves promotion.

## No Historical Fetching Without Approval
- Do not fetch historical NBA seasons or call external APIs unless the user explicitly approves.

## Season Handling
- Any new data or feature script must accept `--season` and use `src.core.data_paths.get_data_paths`.

## Validation
- After touching path/config/inference code, run `python3 scripts/audit/validate_project_structure.py` and `python3 scripts/audit/validate_season_path_refactor.py` if available.

## Diff Discipline
- Before changing multiple files, explain the intended file list.
- Prefer small patches over full-file rewrites.

## Frontend Design System & UI Standards
- Before modifying or creating any frontend UI components, screens, or stylesheets, the AI assistant MUST review `frontend/DESIGN_STANDARD.md`.
- Adhere strictly to the three-layer frontend design system:
  1. **Canonical Standard:** Zero emojis, no arbitrary Tailwind brackets (`text-[13px]`, `p-[18px]`), no `rounded-lg/xl/2xl/3xl` in components, no `font-black/extrabold`, no resting card shadows, no `bg-gradient-*` or `backdrop-blur`.
  2. **Tokens & Components:** Use semantic tokens (`bg-background-primary`, `text-text-primary`, `border-border`, etc.) and reusable primitives under `frontend/src/components/common/`.
  3. **State Discipline:** Always implement the 4 core data states: loading (skeletons), empty, error (with retry), and disabled/pending.
  4. **Verification:** Run `npm run lint:design` and `npm run build` from `frontend/` before concluding UI tasks.

## Token Tasarrufu ve Verimlilik
- **Kod Temizliği (NO EMOJI):** Ürettiğin hiçbir Python kod bloğunun, yorum satırının (comment), docstring'in veya değişken adının içinde KESİNLİKLE emoji kullanma. Kod tamamen profesyonel, temiz ve yalın olmalıdır. Emojileri sadece benimle konuştuğun sohbet metinlerinde kullanabilirsin.
- **Nokta Atışı Dosya Okuma (Surgical Reads):** Büyük dosyaları baştan sona `read_file` ile okumak yerine, aradığın fonksiyonu veya sınıfı bulmak için `grep_search` kullan. Dosyaları okurken her zaman `start_line` ve `end_line` parametrelerini kullanarak sadece ihtiyaç duyduğun kod bloğunu bağlama (context) al.
- **Veri Dosyalarını Okuma Kısıtı:** CSV, Parquet, JSON verilerini veya çok uzun logları ASLA tamamen okumaya veya print etmeye çalışma. Veri yapısını anlaman gerekiyorsa sadece `head -n 5` komutunu kullanarak ilk birkaç satırı oku veya şemaları incele.
- **Kısa ve Doğrudan İletişim:** "Anladım, hemen yapıyorum", "İşte başlıyoruz" gibi conversational (sohbet) dolgu kelimelerinden kaçın. Doğrudan teknik analize, aksiyona veya araç çağrılarına (tool calls) odaklan. Gereksiz özetler yapma.
- **Paralel ve Birleşik İşlemler:** Zaman ve turn (dönüş) sayısından tasarruf etmek için birbirine bağımlı olmayan arama ve okuma işlemlerini paralel yap. Terminal komutlarını çalıştırırken komutları birleştir (Örn: `npm run build && npm test` veya `git status && git diff`).
- **Nokta Atışı Düzenlemeler (Surgical Edits):** Dosyaları güncellerken tüm dosyayı baştan yaratmak yerine, `replace` aracını kullanarak sadece değişen kısımlara odaklan.
