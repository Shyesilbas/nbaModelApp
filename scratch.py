from nba_api.stats.endpoints import playertransactionlogs
import pandas as pd

logs = playertransactionlogs.PlayerTransactionLogs()
df = logs.get_data_frames()[0]
print(df.head())
print(df.columns)
