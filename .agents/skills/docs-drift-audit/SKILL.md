---
name: docs-drift-audit
description: Use when auditing or editing docs, READMEs, reports, skills or AGENTS.md: stale content, broken links, drifted symbol names, word budgets, generated blocks. Runs scripts/check_docs.py.
---

# Docs Drift Audit

Docs describe intent; code and production artifacts are the truth. A doc claim counts as correct only after you verify it in code or generated evaluation JSONs.

## 1. Run the Mechanical Checks
Run all three checks before concluding any documentation or API contract change:

```bash
python3 scripts/check_docs.py
python3 scripts/check_api_endpoints.py
PYTHONPATH=. python3 -m pytest tests/test_docs_consistency.py -q
```

`scripts/check_docs.py` (exit 1 on any issue; `--no-class` skips the symbol scan) reports:

| Code | Meaning | Usual fix |
|---|---|---|
| `MAP` | a `.md` file under `docs/` is not linked from `docs/README.md` | add it to the right section in `docs/README.md`, or remove if obsolete |
| `LINK` | a relative markdown link points to a missing file | point to the moved file or remove the link |
| `SYMBOL` | a backticked CamelCase name matches no Python/TypeScript symbol or allowlist term | rename to the real class/component/type, or rewrite without backticks |
| `SIZE` | `src/*/README.md` (>450 words), `frontend/src/*/README.md` (>450), `AGENTS.md` (>600) or `SKILL.md` (>700) exceeds budget | move narratives, token tables, or examples to `docs/` or `references/` |
| `STALE` | reference to retired root docs (`AI_CONTEXT.md`, `ARTIFACT_REGISTRY.md`, `PROJECT_STATUS.md`) | point to `docs/artifact_registry.md` or `docs/project_status.md` |

- **Backtick Discipline for SYMBOL:** Reserve backticks strictly for real Python classes, TypeScript types/components, or source filenames. Never backtick informal conceptual CamelCase phrases.
- **Zero-Emoji Check:** Run `python3 scripts/check_no_emoji.py` after any markdown or code edit.

## 2. Module Hub Template & One-Home-Per-Fact
Module `README.md` files (`<= 450` words) route agents to code; `docs/` deep dives explain cross-module flows:
1. `# <Name> Domain` (or `# <Name> Module`) + 1-2 sentence scope.
2. `> [!NOTE] **Related Documentation & Runbooks:**` block linking to `docs/*.md`, counterpart frontend/backend READMEs, and **Key Entry Points** (relative file links).
3. `## Business Rules & Invariants` (or `## Component Rules`) — terse bullets, one rule each, plus `**Change rule:**` bullets for module-specific pitfalls.
4. Data, SQLite store, or artifact sections only when owned by that module.
5. `## API` (for `src/api/README.md`) — one line per route group (`METHOD /path` — purpose + schema class).
- Never duplicate metric tables or JSON payload samples inside module hubs; keep those in `docs/` or `reports/`.

## 3. Generated Block & Release Discipline
- `README.md`, `docs/project_status.md`, and `docs/reports/models/*.md` contain `<!-- BEGIN GENERATED: ... -->` blocks refreshed exclusively by `PYTHONPATH=. python3 scripts/refresh_reports.py`. Never hand-edit numbers inside generated markers.
- Keep `AGENTS.md` aligned with `config/production_artifacts.yaml` release (`v15`) and `win_model.pkl` / `player_model_*.pkl` feature counts checked by `tests/test_docs_consistency.py`.
- Keep `docs/artifact_registry.md`, `docs/project_status.md`, `docs/README.md`, and `reports/README.md` synchronized when promotions or pipeline changes land.
