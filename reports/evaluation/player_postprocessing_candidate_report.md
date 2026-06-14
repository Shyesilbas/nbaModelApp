# Player Post-Processing Segment-Level Calibration Report

Chronological split date: player games after 2026-02-07.

## Overall Comparison of Strategies

### PTS MAE by Strategy
| segment | base_no_corr_mae | me_segment_table_mae | overlapping_sum_mae | overlapping_avg_mae | ridge_regression_mae |
| --- | --- | --- | --- | --- | --- |
| overall | 4.5542 | 4.5492 | 4.5502 | 4.5526 | 4.5476 |
| regular_season | 4.6418 | 4.6419 | 4.6426 | 4.6424 | 4.6405 |
| playoffs | 4.1615 | 4.1332 | 4.1357 | 4.1501 | 4.1311 |
| home | 4.4891 | 4.4818 | 4.4848 | 4.4876 | 4.4835 |
| away | 4.6197 | 4.6169 | 4.6159 | 4.6180 | 4.6120 |
| guard | 4.7266 | 4.7211 | 4.7216 | 4.7240 | 4.7190 |
| wing | 4.4295 | 4.4256 | 4.4232 | 4.4263 | 4.4208 |
| big | 4.2679 | 4.2624 | 4.2698 | 4.2714 | 4.2671 |
| high_usage | 5.8182 | 5.8163 | 5.8182 | 5.8185 | 5.8199 |
| med_usage | 4.7015 | 4.6957 | 4.6970 | 4.6995 | 4.6951 |
| low_usage | 3.5498 | 3.5443 | 3.5441 | 3.5476 | 3.5379 |
| heavy_minutes | 5.6852 | 5.6817 | 5.6840 | 5.6847 | 5.6855 |
| rotation_minutes | 4.6666 | 4.6629 | 4.6626 | 4.6650 | 4.6611 |
| light_minutes | 3.1159 | 3.1059 | 3.1088 | 3.1133 | 3.0994 |

### REB MAE by Strategy
| segment | base_no_corr_mae | me_segment_table_mae | overlapping_sum_mae | overlapping_avg_mae | ridge_regression_mae |
| --- | --- | --- | --- | --- | --- |
| overall | 1.9391 | 1.9214 | 1.9211 | 1.9259 | 1.9194 |
| regular_season | 1.9526 | 1.9344 | 1.9344 | 1.9388 | 1.9332 |
| playoffs | 1.8783 | 1.8634 | 1.8615 | 1.8680 | 1.8578 |
| home | 1.9319 | 1.9109 | 1.9109 | 1.9195 | 1.9089 |
| away | 1.9463 | 1.9320 | 1.9313 | 1.9323 | 1.9299 |
| guard | 1.6973 | 1.6622 | 1.6582 | 1.6700 | 1.6567 |
| wing | 1.9731 | 1.9768 | 1.9785 | 1.9769 | 1.9768 |
| big | 2.5589 | 2.5565 | 2.5633 | 2.5586 | 2.5612 |
| high_usage | 2.0973 | 2.0778 | 2.0765 | 2.0831 | 2.0779 |
| med_usage | 1.9280 | 1.9085 | 1.9084 | 1.9127 | 1.9068 |
| low_usage | 1.8702 | 1.8570 | 1.8568 | 1.8616 | 1.8531 |
| heavy_minutes | 2.1897 | 2.1796 | 2.1800 | 2.1812 | 2.1822 |
| rotation_minutes | 1.9846 | 1.9640 | 1.9622 | 1.9688 | 1.9621 |
| light_minutes | 1.5674 | 1.5495 | 1.5521 | 1.5560 | 1.5424 |

### AST MAE by Strategy
| segment | base_no_corr_mae | me_segment_table_mae | overlapping_sum_mae | overlapping_avg_mae | ridge_regression_mae |
| --- | --- | --- | --- | --- | --- |
| overall | 1.3709 | 1.3668 | 1.3674 | 1.3689 | 1.3665 |
| regular_season | 1.4096 | 1.4076 | 1.4081 | 1.4085 | 1.4076 |
| playoffs | 1.1978 | 1.1837 | 1.1852 | 1.1915 | 1.1820 |
| home | 1.3812 | 1.3752 | 1.3769 | 1.3788 | 1.3770 |
| away | 1.3606 | 1.3583 | 1.3579 | 1.3590 | 1.3559 |
| guard | 1.5334 | 1.5420 | 1.5434 | 1.5408 | 1.5424 |
| wing | 1.2142 | 1.1947 | 1.1945 | 1.2009 | 1.1935 |
| big | 1.1616 | 1.1457 | 1.1455 | 1.1509 | 1.1447 |
| high_usage | 1.8633 | 1.8618 | 1.8622 | 1.8622 | 1.8592 |
| med_usage | 1.3602 | 1.3575 | 1.3585 | 1.3593 | 1.3585 |
| low_usage | 1.1100 | 1.1015 | 1.1017 | 1.1053 | 1.1000 |
| heavy_minutes | 1.8871 | 1.8835 | 1.8833 | 1.8844 | 1.8835 |
| rotation_minutes | 1.3676 | 1.3650 | 1.3660 | 1.3663 | 1.3657 |
| light_minutes | 0.8539 | 0.8452 | 0.8459 | 0.8506 | 0.8419 |

## Summary Findings

### 1. Optimal Post-Processing Strategy
- **PTS Best Strategy**: `ridge_regression` (MAE: 4.5476 vs Raw: 4.5542)
- **REB Best Strategy**: `ridge_regression` (MAE: 1.9194 vs Raw: 1.9391)
- **AST Best Strategy**: `ridge_regression` (MAE: 1.3665 vs Raw: 1.3709)

### 2. Segment Bias Reductions (Ridge vs Raw)
- **Playoffs PTS Bias**: Ridge: -0.0738 vs Raw: 0.1459
- **Bigs REB Bias**: Ridge: -0.0480 vs Raw: -0.5431
- **Guards AST Bias**: Ridge: -0.0439 vs Raw: -0.1339

### 3. Ridge Coefficients
Features: ['is_playoff', 'is_home', 'pos_guard', 'pos_wing', 'pos_big', 'high_usage', 'low_usage', 'heavy_minutes', 'light_minutes']
- **PTS Intercept**: 0.0201, Coefs: [0.23304587969274396, -0.08837946618803313, 0.04088944856238208, 0.0580296956682599, -0.09891914423068603, -0.0032368619419164586, 0.023290047027092756, -0.05553340533521338, 0.018685451985293703]
- **REB Intercept**: -0.1113, Coefs: [0.054963797730663885, -0.0022495355924547324, 0.3446112439337021, 0.04949161959681093, -0.39410286352985446, -0.059410736072260516, 0.0017162174808414668, -0.023021308663101557, 0.05083702858280898]
- **AST Intercept**: 0.0414, Coefs: [0.09410225334563482, -0.03202171810154646, -0.14229181916232372, 0.0796328425393561, 0.06265897662285541, 0.030714729877387072, 0.008088065911198128, -0.0027476542580082155, 0.008875026909803017]
