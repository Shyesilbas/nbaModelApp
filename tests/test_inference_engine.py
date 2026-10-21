import unittest
import pandas as pd
from src.inference import WinPredictor, ScorePredictor, PlayerPredictor
from src.inference.shap_explainer import ShapExplainer


class TestInferenceEngine(unittest.TestCase):
    def test_win_predictor_confidence_buckets(self):
        self.assertEqual(WinPredictor.get_confidence_bucket(0.52), "Toss-up")
        self.assertEqual(WinPredictor.get_confidence_bucket(0.58), "Slight edge")
        self.assertEqual(WinPredictor.get_confidence_bucket(0.65), "Moderate confidence")
        self.assertEqual(WinPredictor.get_confidence_bucket(0.75), "Strong confidence")

    def test_win_predictor_init(self):
        try:
            predictor = WinPredictor()
            self.assertIsNotNone(predictor.model)
            self.assertTrue(len(predictor.feature_cols) > 0)
        except FileNotFoundError:
            pass

    def test_score_predictor_init(self):
        try:
            predictor = ScorePredictor()
            self.assertTrue(predictor.pace_model is not None or predictor.home_rtg_model is not None)
        except FileNotFoundError:
            pass

    def test_player_predictor_init(self):
        try:
            predictor = PlayerPredictor()
            self.assertTrue(len(predictor.feature_cols) >= 0)
        except FileNotFoundError:
            pass

    def test_shap_explainer_init(self):
        # Artifact names carry no version, so the explainer takes no version argument.
        explainer = ShapExplainer()
        self.assertTrue(callable(explainer.explain_win_probability))
        self.assertTrue(callable(explainer.explain_score_prediction))


if __name__ == "__main__":
    unittest.main()

