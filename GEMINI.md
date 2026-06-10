# Project Rules

## Production Safety
- Production artifacts under `models/production/`, `data/production/`, and `config/production_artifacts.yaml` must never be overwritten unless the user explicitly approves.

## Artifact Registry Authority
- `ARTIFACT_REGISTRY.md` is the single source of truth for artifact status.
- Before using, modifying, promoting, archiving, or replacing any dataset, report, model, or metadata file, consult `ARTIFACT_REGISTRY.md` first.

## Experimental Work
- New experiments must write outputs under the current experimental artifact locations tracked in `ARTIFACT_REGISTRY.md`.

## Reports
- Audit and analysis reports must go under the active audit/report locations tracked in `ARTIFACT_REGISTRY.md`.
- Experiment reports must be registered before they are treated as active outputs.

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

## Token Tasarrufu ve Verimlilik
- **Kod Temizliği (NO EMOJI):** Ürettiğin hiçbir Python kod bloğunun, yorum satırının (comment), docstring'in veya değişken adının içinde KESİNLİKLE emoji kullanma. Kod tamamen profesyonel, temiz ve yalın olmalıdır. Emojileri sadece benimle konuştuğun sohbet metinlerinde kullanabilirsin.
- **Nokta Atışı Dosya Okuma (Surgical Reads):** Büyük dosyaları baştan sona `read_file` ile okumak yerine, aradığın fonksiyonu veya sınıfı bulmak için `grep_search` kullan. Dosyaları okurken her zaman `start_line` ve `end_line` parametrelerini kullanarak sadece ihtiyaç duyduğun kod bloğunu bağlama (context) al.
- **Veri Dosyalarını Okuma Kısıtı:** CSV, Parquet, JSON verilerini veya çok uzun logları ASLA tamamen okumaya veya print etmeye çalışma. Veri yapısını anlaman gerekiyorsa sadece `head -n 5` komutunu kullanarak ilk birkaç satırı oku veya şemaları incele.
- **Kısa ve Doğrudan İletişim:** "Anladım, hemen yapıyorum", "İşte başlıyoruz" gibi conversational (sohbet) dolgu kelimelerinden kaçın. Doğrudan teknik analize, aksiyona veya araç çağrılarına (tool calls) odaklan. Gereksiz özetler yapma.
- **Paralel ve Birleşik İşlemler:** Zaman ve turn (dönüş) sayısından tasarruf etmek için birbirine bağımlı olmayan arama ve okuma işlemlerini paralel yap. Terminal komutlarını çalıştırırken komutları birleştir (Örn: `npm run build && npm test` veya `git status && git diff`).
- **Nokta Atışı Düzenlemeler (Surgical Edits):** Dosyaları güncellerken tüm dosyayı baştan yaratmak yerine, `replace` aracını kullanarak sadece değişen kısımlara odaklan.
