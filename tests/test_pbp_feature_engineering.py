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


if __name__ == "__main__":
    unittest.main()
