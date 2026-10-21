import unittest

from src.inference.win_blend import blend_win_probability


class WinBlendTest(unittest.TestCase):
    def test_no_weight_returns_model_probability(self):
        self.assertEqual(blend_win_probability(0.39, {"EARLY_SEASON_ELO_BLEND_WEIGHT": 0.0}), 0.39)
        self.assertEqual(blend_win_probability(0.39, {}), 0.39)

    def test_blend_matches_lal_bos_example(self):
        feats = {"EARLY_SEASON_ELO_BLEND_WEIGHT": 0.4, "PRE_GAME_ELO": 1551.9, "OPP_PRE_GAME_ELO": 1561.9}
        self.assertAlmostEqual(blend_win_probability(0.3934, feats), 0.4589, places=3)


if __name__ == "__main__":
    unittest.main()
