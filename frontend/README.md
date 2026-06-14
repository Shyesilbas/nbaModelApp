# NBA Intelligence Lab - Frontend Dashboard

The **NBA Intelligence Lab** is a high-performance, polished, React-based dashboard designed to explore and visualize the current NBA datasets, team rosters, and feature engineering outputs before we train machine learning models.

> [!NOTE]
> Most dashboard views are static-data driven. They fetch preprocessed JSON datasets exported from the Python data pipeline. Prediction views call the FastAPI ML service directly, using `VITE_API_BASE_URL` or `http://localhost:8001` by default.

---

## 🎨 Design System & Visuals
- **Dark Mode Aesthetic**: Sleek navy/black slate background (`#0b111e`) matching professional sports analytics terminals.
- **Glassmorphism**: Translucent cards with subtle borders, blur effects, and hover glows.
- **Data Visualization**: Customized interactive charts using **Recharts** representing team distributions and player importance rankings.
- **Iconography**: Styled with **Lucide React** icons.

---

## 🚀 Getting Started

### 1. Prerequisite: Export JSON Datasets
Before running the frontend, make sure to generate the static JSON data files from the project's CSVs. Run the following command from the **root directory** of the project:

```bash
python3 scripts/export_frontend_data.py
```

This will read datasets under `data/` and serialize them as optimized JSON records inside the frontend assets directory:
- `frontend/public/data/team_rosters.json`
- `frontend/public/data/core_players.json`
- `frontend/public/data/star_candidates.json`
- `frontend/public/data/multi_team_players.json`
- `frontend/public/data/player_name_lookup.json`
- `frontend/public/data/dataset_summary.json`

### 2. Launch Local Dev Server
Navigate into the `frontend/` directory, install package dependencies, and spin up the Vite development server:

```bash
cd frontend
npm install
npm run dev
```

By default, Vite will start the app on [http://localhost:5173](http://localhost:5173). Open this URL in your web browser.

### 3. Production Build
To verify type-safety and bundle efficiency, compile the application:

```bash
npm run build
```

This generates a optimized single-page build inside the `frontend/dist/` directory.

---

## 📂 Project Architecture

```
frontend/
├── public/
│   └── data/               <-- JSON records exported from Python pipeline
├── src/
│   ├── components/         <-- Dashboard Page Views
│   │   ├── Overview.tsx           # High-level summary & season split charts
│   │   ├── TeamExplorer.tsx       # Team profiles, roster tables, core player cards
│   │   ├── CorePlayers.tsx        # Team-by-team core/secondary groups & importance charts
│   │   ├── StarCandidates.tsx     # League-wide paginated star candidates rankings
│   │   ├── MultiTeamPlayers.tsx   # Visual grid of multi-team/traded players
│   │   ├── DatasetHealth.tsx      # ML audit logs, record counts, and leak indicators
│   │   └── FutureModeling.tsx     # Pipeline roadmaps (Baselines, XGBoost, etc.)
│   ├── App.tsx             # Sidebar navigation, route selection & state handlers
│   ├── index.css           # Tailwind base styles, scrollbars, and background gradients
│   └── main.tsx            # Vite/React entrypoint
├── tailwind.config.js      # Custom theme setup (slate-950 base, slate accents)
├── postcss.config.js       # PostCSS config
├── package.json            # Vite, React, TS, Tailwind, Recharts, Lucide dependencies
└── tsconfig.json           # strict TypeScript compiler options
```

---

## 📊 Available Views

1. **Overview Dashboard**: Displays key high-level statistics like total teams, total players, row counts for raw logs, and visual distributions of game splits.
2. **Team Explorer**: Select any of the 30 NBA teams to view their full discovered roster (table) and key metrics for their Top 5 Core Players.
3. **Core Roster Groups**: Interactive Recharts bar chart showing player importance scores per team, indicating who constitutes the core (Top 3) vs secondary (Top 5) players.
4. **League Star Candidates**: A searchable, sortable list of the league's top candidates based on calculated importance scores, game participation, and average scoring.
5. **Traded Players Grid**: Visual representations of players who played for multiple franchises during the season.
6. **Dataset Health & Audit**: Data profiling reports, listing missing values and details of compiled ML datasets (V1, V2, V3).
7. **Future Modeling**: Concept cards previewing subsequent pipeline iterations (XGBoost baseline, validation splits, and feature importances).
