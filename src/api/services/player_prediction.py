from . import win_prediction as svc
from .player_projection import get_player_predictions
from ..schemas import PlayerPrediction, PlayerPredictionResponse, ScorePredictionRequest


def predict_players(request: ScorePredictionRequest) -> PlayerPredictionResponse:
    if svc.player_loader.pts_model is None:
        svc.init_model()
    if svc.player_loader.pts_model is None:
        raise FileNotFoundError("Player models not loaded.")

    home_team = request.home_team.upper()
    away_team = request.away_team.upper()
    pred_date_str = request.prediction_date.isoformat() if hasattr(request.prediction_date, "isoformat") else str(request.prediction_date)

    players_df = get_player_predictions(
        home_team,
        away_team,
        pred_date_str,
        svc.player_loader,
        svc.score_loader,
        player_status_overrides=request.player_status_overrides,
    )

    home_players_df = players_df[players_df["IS_HOME"] == 1]
    away_players_df = players_df[players_df["IS_HOME"] == 0]

    # Not rescaled to the team score (see game_full._predict_game_full_players)
    home_scale = away_scale = 1.0

    def parse_players(df, scale):
        players = []
        for _, r in df.iterrows():
            s_pts = round(float(r["RAW_PROJ_PTS"]) * scale, 1)
            s_reb = round(float(r["RAW_PROJ_REB"]) * scale, 1)
            s_ast = round(float(r["RAW_PROJ_AST"]) * scale, 1)
            players.append(PlayerPrediction(
                player_id=int(r["PLAYER_ID"]),
                player_name=str(r.get("PLAYER_NAME", f"Player {r['PLAYER_ID']}")),
                position_group=svc.CANONICAL_POSITIONS.get(int(r["PLAYER_ID"]), str(r.get("PLAYER_POSITION_GROUP", "UNKNOWN"))),
                predicted_pts=s_pts,
                predicted_reb=s_reb,
                predicted_ast=s_ast,
                predicted_pra=round(s_pts + s_reb + s_ast, 1)
            ))
        return players

    home_list = parse_players(home_players_df, home_scale)
    away_list = parse_players(away_players_df, away_scale)
    home_list.sort(key=lambda x: x.predicted_pts, reverse=True)
    away_list.sort(key=lambda x: x.predicted_pts, reverse=True)

    return PlayerPredictionResponse(
        home_team=home_team,
        away_team=away_team,
        prediction_date=pred_date_str,
        home_players=home_list,
        away_players=away_list,
        score_model_sync=True,
        model_version=svc.player_loader.get_version()
    )
