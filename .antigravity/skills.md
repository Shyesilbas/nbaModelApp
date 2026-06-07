# Project Rules

## Production Safety
- Production artifacts under `models/production/`, `data/production/`, and `config/production_artifacts.yaml` must never be overwritten unless the user explicitly approves.

## Artifact Registry Authority
- `ARTIFACT_REGISTRY.md` is the single source of truth for artifact status.
- Before using, modifying, promoting, archiving, or replacing any dataset, report, model, or metadata file, consult `ARTIFACT_REGISTRY.md` first.

## Experimental Work
- New experiments must write outputs under `models/experimental/`, `data/experimental/`, or `reports/experiments/`.

## Reports
- Audit and analysis reports must go under `reports/audits/`.
- Experiment reports must go under `reports/experiments/`.

## Current Production Decision
- Win Probability V1 is the production winner model.
- Score Prediction V2 is the production score/range model.
- Win V2, EMA, and tuned RF are experimental unless explicitly promoted.

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
- Any new data or feature script must accept `--season` and use `scripts.data_paths.get_data_paths`.

## Validation
- After touching path/config/inference code, run `python3 scripts/audit/validate_project_structure.py` and `python3 scripts/audit/validate_season_path_refactor.py` if available.

## Diff Discipline
- Before changing multiple files, explain the intended file list.
- Prefer small patches over full-file rewrites.

## Token Tasarrufu
- **Kod Temizliği (NO EMOJI):** Ürettiğin hiçbir Python kod bloğunun, yorum satırının (comment), docstring'in veya değişken adının içinde KESİNLİKLE emoji kullanma. Kod tamamen profesyonel, temiz ve yalın olmalıdır. Emojileri sadece benimle konuştuğun sohbet metinlerinde kullanabilirsin.
