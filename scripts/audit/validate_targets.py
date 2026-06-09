import pandas as pd

def validate_win_target():
    df = pd.read_csv('data/experimental/team_win_model_ready_v2_2024_25.csv')
    if 'WIN' in df.columns:
        print("WIN target exists in win dataset.")
        print("WIN target distribution:")
        print(df['WIN'].value_counts())
    else:
        print("WIN target does not exist in win dataset.")

def validate_score_targets():
    df = pd.read_csv('data/experimental/team_score_model_ready_v2_2024_25.csv')
    if 'HOME_PTS' in df.columns and 'AWAY_PTS' in df.columns:
        print("HOME_PTS and AWAY_PTS targets exist in score dataset.")
        print("HOME_PTS stats:")
        print(df['HOME_PTS'].describe())
        print("AWAY_PTS stats:")
        print(df['AWAY_PTS'].describe())
    else:
        print("HOME_PTS and/or AWAY_PTS targets do not exist in score dataset.")

if __name__ == '__main__':
    validate_win_target()
    validate_score_targets()
