import unittest
import pandas as pd

from src.processing.pbp_cleaner import parse_clock_to_seconds, clean_pbp_events
from src.processing.pbp_feature_extractor import extract_game_pbp_features
from src.processing.pbp_integration import integrate_pbp_features


class TestPBPFeatureEngineering(unittest.TestCase):

    def test_clock_parsing(self):
        self.assertEqual(parse_clock_to_seconds("05:30"), 330.0)
        self.assertEqual(parse_clock_to_seconds("12:00"), 720.0)
        self.assertEqual(parse_clock_to_seconds("PT02M15.00S"), 135.0)
        self.assertEqual(parse_clock_to_seconds(""), 0.0)

    def test_garbage_time_and_clutch_tagging(self):
        sample_game = {
            "game_id": "0022500001",
            "home_team": "OKC",
            "away_team": "HOU",
            "events": [
                # Q1 event (competitive)
                {"period": 1, "clock": "10:00", "home_score": 5, "away_score": 2},
                # Q4 event (clutch: margin 2, clock 4 mins)
                {"period": 4, "clock": "04:00", "home_score": 100, "away_score": 98},
                # Q4 event (garbage: margin 20, clock 2 mins)
                {"period": 4, "clock": "02:00", "home_score": 120, "away_score": 100},
            ]
        }
        
        df_events = clean_pbp_events(sample_game)
        self.assertEqual(len(df_events), 3)
        
        # Check Q1 non-garbage, non-clutch
        self.assertFalse(df_events.iloc[0]["IS_GARBAGE_TIME"])
        self.assertFalse(df_events.iloc[0]["IS_CLUTCH"])
        
        # Check Q4 clutch
        self.assertFalse(df_events.iloc[1]["IS_GARBAGE_TIME"])
        self.assertTrue(df_events.iloc[1]["IS_CLUTCH"])
        
        # Check Q4 garbage
        self.assertTrue(df_events.iloc[2]["IS_GARBAGE_TIME"])
        self.assertFalse(df_events.iloc[2]["IS_CLUTCH"])

    def test_feature_extraction(self):
        sample_game = {
            "game_id": "0022500001",
            "home_team": "OKC",
            "away_team": "HOU",
            "events": [
                {"period": 1, "clock": "12:00", "home_score": 0, "away_score": 0},
                {"period": 4, "clock": "04:00", "home_score": 90, "away_score": 88},
                {"period": 4, "clock": "02:00", "home_score": 100, "away_score": 80},
            ]
        }
        df_events = clean_pbp_events(sample_game)
        feat = extract_game_pbp_features(df_events)
        
        self.assertEqual(feat["GAME_ID"], "0022500001")
        self.assertIn("GARBAGE_TIME_SHARE", feat)
        self.assertIn("CLUTCH_MARGIN", feat)

    def test_integration_fallback(self):
        df_team = pd.DataFrame({"GAME_ID": ["0022500001", "0022500002"]})
        df_merged = integrate_pbp_features(df_team, season_dir="non_existent_dir")
        
        self.assertIn("GARBAGE_TIME_SHARE", df_merged.columns)
        self.assertIn("CLUTCH_MARGIN", df_merged.columns)
        self.assertEqual(df_merged["GARBAGE_TIME_SHARE"].iloc[0], 0.0)

    def test_incremental_situational_preserves_other_seasons(self):
        import json
        import tempfile
        from pathlib import Path
        from src.features.pbp_situational import build_situational_dataset

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            past_csv = root / "pbp_situational_features.csv"
            pd.DataFrame([{
                "GAME_ID": "0022400001",
                "SEASON_TYPE": "Regular Season",
                "IS_PLAYOFF": False,
                "PLAYOFF_ROUND": None,
                "HOME_TEAM": "BOS",
                "AWAY_TEAM": "NYK",
                "TOTAL_PBP_EVENTS": 100,
                "GARBAGE_TIME_SHARE": 0.1,
                "GARBAGE_TIME_PTS_SHARE": 0.08,
                "CLEAN_HOME_PTS": 95,
                "CLEAN_AWAY_PTS": 90,
                "CLEAN_MARGIN": 5,
                "CLUTCH_EVENT_COUNT": 12,
                "CLUTCH_HOME_PTS": 10,
                "CLUTCH_AWAY_PTS": 8,
                "CLUTCH_MARGIN": 2,
            }]).to_csv(past_csv, index=False)

            pbp_dir = root / "season=2025-26" / "raw" / "play_by_play"
            pbp_dir.mkdir(parents=True)
            (pbp_dir / "0022500001.json").write_text(json.dumps({
                "game_id": "0022500001",
                "home_team": "OKC",
                "away_team": "HOU",
                "events": [{"period": 1, "clock": "10:00", "home_score": 10, "away_score": 8}],
            }), encoding="utf-8")

            df = build_situational_dataset(str(root), seasons=["2025-26"], existing_csv=past_csv)
            gids = set(df["GAME_ID"].astype(str).str.zfill(10))
            self.assertEqual(gids, {"0022400001", "0022500001"})

    def test_pregame_rows_cached_invalidates_on_file_mtime(self):
        import tempfile
        from pathlib import Path
        from unittest import mock
        from types import SimpleNamespace
        from src.features import build_matchup_features as bmf

        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "team_games.csv"
            p.write_text("GAME_ID\n", encoding="utf-8")
            bmf._pregame_rows_versioned.cache_clear()
            with (
                mock.patch.object(bmf, "get_data_paths", return_value=SimpleNamespace(team_games_raw=str(p))),
                mock.patch.object(bmf, "_pregame_rows_versioned", return_value={"ok": 1}) as spy,
            ):
                bmf._pregame_rows_cached("2025-26", "2026-01-01", ())
                mtime1 = spy.call_args[0][3]
                import time
                time.sleep(0.02)
                p.write_text("GAME_ID\n0022500001\n", encoding="utf-8")
                bmf._pregame_rows_cached("2025-26", "2026-01-01", ())
                mtime2 = spy.call_args[0][3]
                self.assertNotEqual(mtime1, mtime2)


if __name__ == "__main__":
    unittest.main()
