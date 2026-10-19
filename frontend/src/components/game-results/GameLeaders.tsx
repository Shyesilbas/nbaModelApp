export interface LeaderStatItem {
  player_name?: string;
  n?: string;
  value?: number | string | null;
}

export function GameLeaders({
  leaders,
}: {
  leaders?: { points?: LeaderStatItem; rebounds?: LeaderStatItem; assists?: LeaderStatItem } | null;
}) {
  if (!leaders) return null;

  const items = [
    { label: "Points", data: leaders.points },
    { label: "Rebounds", data: leaders.rebounds },
    { label: "Assists", data: leaders.assists },
  ].filter((item) => item.data && (item.data.player_name || item.data.n));

  if (items.length === 0) return null;

  return (
    <div className="rounded border border-border bg-background-primary p-4 sm:p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-text-primary">Game leaders</h3>
        <p className="mt-0.5 text-xs text-text-secondary">Top performers by category</p>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-3">
        {items.map((entry) => {
          const data = entry.data;
          if (!data) return null;
          return (
            <div key={entry.label} className="rounded border border-border bg-background-primary p-3">
              <p className="text-xs font-medium text-text-muted">{entry.label}</p>
              <p className="mt-1 truncate text-xs font-semibold leading-tight text-text-primary">
                {data.player_name || data.n}
              </p>
              {data.value != null && (
                <p className="mt-1 text-base font-semibold tabular-nums text-text-primary">{data.value}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
