def apply_top_down_scaling(team_score_prediction: float, player_projections_list: list) -> tuple[list, float]:
    """
    Applies top-down scaling to synchronize player point projections with the team's expected score.

    Args:
        team_score_prediction: The expected team score from the XGBoost Score model.
        player_projections_list: List of raw player PTS projections.

    Returns:
        scaled_player_pts: List of scaled player PTS projections.
        scale_factor: The multiplier applied to the raw projections.
    """
    raw_sum = sum(player_projections_list)
    
    # Avoid division by zero and cap scale factor to prevent distortive swings
    if raw_sum > 0:
        scale_factor = max(0.70, min(1.30, team_score_prediction / raw_sum))
    else:
        scale_factor = 1.0

    # Scale each player projection ensuring non-negative
    scaled_player_pts = [max(0.0, p * scale_factor) for p in player_projections_list]

    return scaled_player_pts, scale_factor

