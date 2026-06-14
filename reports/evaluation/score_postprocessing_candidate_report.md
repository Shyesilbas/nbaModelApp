# SCORE Post-Processing Segment-Level Calibration Report

Chronological split: training <= 2025-04-06, test > 2025-04-06.

## Overall Comparison of Strategies

| Strategy | Total MAE | Total Bias | Margin MAE | Margin Bias | Home MAE | Away MAE |
| --- | --- | --- | --- | --- | --- | --- |
| `base_no_corr` | 14.8537 | -0.4425 | 12.2611 | -0.1713 | 9.3989 | 9.7111 |
| `me_segment_table` | 14.7622 | -1.0675 | 12.2401 | -0.1669 | 9.3727 | 9.6708 |
| `overlapping_sum` | 14.7588 | -1.2039 | 12.2603 | 0.0125 | 9.3687 | 9.6581 |
| `overlapping_avg` | 14.7802 | -1.1849 | 12.2534 | -0.0330 | 9.3698 | 9.6652 |
| `ridge_regression` | 14.7552 | -1.0848 | 12.2555 | -0.1484 | 9.3773 | 9.6617 |

## Segment-Level Details

### Total Score MAE Comparison
| segment | base_no_corr_total_mae | me_segment_table_total_mae | overlapping_sum_total_mae | overlapping_avg_total_mae | ridge_regression_total_mae |
| --- | --- | --- | --- | --- | --- |
| overall | 14.8537 | 14.7622 | 14.7588 | 14.7802 | 14.7552 |
| home_b2b | 15.7562 | 15.7417 | 15.6713 | 15.7107 | 15.6935 |
| away_b2b | 15.0927 | 15.1222 | 15.1151 | 15.1037 | 15.1025 |
| either_b2b | 15.3629 | 15.3710 | 15.3258 | 15.3424 | 15.3313 |
| away_rest_advantage | 15.6631 | 15.6598 | 15.5940 | 15.6391 | 15.6198 |
| home_rest_advantage | 14.3653 | 14.1887 | 14.2210 | 14.2866 | 14.1899 |
| playoffs | 14.9505 | 14.3877 | 14.3935 | 14.5001 | 14.4070 |

### Total Score Bias Comparison
| segment | base_no_corr_total_bias | me_segment_table_total_bias | overlapping_sum_total_bias | overlapping_avg_total_bias | ridge_regression_total_bias |
| --- | --- | --- | --- | --- | --- |
| overall | -0.4425 | -1.0675 | -1.2039 | -1.1849 | -1.0848 |
| home_b2b | -2.1703 | -1.9868 | -1.6149 | -1.8926 | -2.0705 |
| away_b2b | -1.3628 | -1.5441 | -1.6380 | -1.5004 | -1.7904 |
| either_b2b | -2.5455 | -2.5884 | -2.3419 | -2.4437 | -2.5436 |
| away_rest_advantage | -2.4058 | -1.8221 | -1.5965 | -1.8145 | -1.6334 |
| home_rest_advantage | -1.5798 | -1.7006 | -2.0940 | -1.8278 | -1.6991 |
| playoffs | 4.8014 | -0.6862 | -0.6680 | -0.3944 | -0.6743 |

### Margin MAE Comparison
| segment | base_no_corr_margin_mae | me_segment_table_margin_mae | overlapping_sum_margin_mae | overlapping_avg_margin_mae | ridge_regression_margin_mae |
| --- | --- | --- | --- | --- | --- |
| overall | 12.2611 | 12.2401 | 12.2603 | 12.2534 | 12.2555 |
| home_b2b | 12.9367 | 12.8306 | 12.8879 | 12.8874 | 12.9226 |
| away_b2b | 12.3688 | 12.3203 | 12.4382 | 12.3724 | 12.4501 |
| either_b2b | 12.8824 | 12.8144 | 12.8629 | 12.8410 | 12.8717 |
| away_rest_advantage | 12.9228 | 12.8887 | 12.9219 | 12.9490 | 12.8749 |
| home_rest_advantage | 12.3630 | 12.3951 | 12.3813 | 12.3461 | 12.3896 |
| playoffs | 13.8294 | 13.7684 | 13.7704 | 13.7611 | 13.7586 |

### Margin Bias Comparison
| segment | base_no_corr_margin_bias | me_segment_table_margin_bias | overlapping_sum_margin_bias | overlapping_avg_margin_bias | ridge_regression_margin_bias |
| --- | --- | --- | --- | --- | --- |
| overall | -0.1713 | -0.1669 | 0.0125 | -0.0330 | -0.1484 |
| home_b2b | 2.3917 | 1.3984 | 1.1690 | 1.7803 | 1.5522 |
| away_b2b | 0.1191 | 0.9486 | 1.9955 | 1.0573 | 1.7356 |
| either_b2b | 1.2448 | 1.3826 | 1.5202 | 1.3825 | 1.5156 |
| away_rest_advantage | 1.3771 | 0.7212 | -0.4730 | 0.1384 | 0.0837 |
| home_rest_advantage | -1.0251 | -0.3527 | 0.7096 | 0.0265 | -0.2827 |
| playoffs | -0.9929 | -0.0784 | -0.0317 | -0.1022 | -0.0782 |

## Learned Corrections

### Mutually Exclusive Table
Total: {
  "away_b2b": 0.3834858087125726,
  "away_rest_advantage": -1.2421386377008494,
  "home_b2b": -0.18352575645906788,
  "home_rest_advantage": -1.008829416362677,
  "other": -0.18655229538441817,
  "playoffs": 5.487536886006945
}

Margin: {
  "away_b2b": -1.8401350206839893,
  "away_rest_advantage": 0.3339271955818052,
  "home_b2b": 0.9933303787648667,
  "home_rest_advantage": 0.675773308999152,
  "other": 0.2144528578579813,
  "playoffs": -0.9145029762279455
}

### Overlapping Table
Total: {
  "playoffs": 5.487536886006944,
  "home_b2b": -0.18352575645906788,
  "away_b2b": 0.36726422511495793,
  "home_rest_advantage": -0.041453316932642946,
  "away_rest_advantage": -0.8030281506082709
}

Margin: {
  "playoffs": -0.9145029762279455,
  "home_b2b": 0.9933303787648666,
  "away_b2b": -1.6907982634926622,
  "home_rest_advantage": -0.8392838337768561,
  "away_rest_advantage": 1.3494905800496044
}

### Ridge Regression Coefficients
Features: ['is_playoff', 'home_b2b', 'away_b2b', 'home_rest_advantage', 'away_rest_advantage']
Total Intercept: -0.2241, Coefs: [ 5.75333876  0.33506887  0.82573241 -0.45633214 -0.81548892]
Margin Intercept: 0.2067, Coefs: [-1.16100061  1.28376964 -2.52033404  0.37186243  0.43937607]

## Decision
Recommended Strategy: `ridge_regression`