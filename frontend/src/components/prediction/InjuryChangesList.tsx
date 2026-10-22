import { Badge } from "../common";

export type InjuryChange = {
  team: string;
  player_name: string;
  steps: { status: string | null; at: string }[];
};

const VARIANT: Record<string, "error" | "warning" | "neutral" | "success"> = {
  Out: "error",
  Doubtful: "warning",
  Questionable: "warning",
  Probable: "neutral",
  Available: "success",
};

const clock = (published: string) => published.split(" ").slice(1).join(" ");

/** Status changes of players across today's injury reports ("not on the report" reads as Available). */
export function InjuryChangesList({ changes }: { changes: InjuryChange[] }) {
  if (changes.length === 0) return null;
  return (
    <div className="rounded border border-status-warning/30 bg-status-warning/10 p-3">
      <p className="mb-2 text-xs font-medium text-text-primary">Injury report changes today</p>
      <ul className="space-y-1.5">
        {changes.map((c) => (
          <li key={`${c.team}-${c.player_name}`} className="flex flex-wrap items-center gap-1.5 text-xs text-text-secondary">
            <span className="text-text-primary">{c.player_name}</span>
            <span>({c.team})</span>
            {c.steps.map((s, i) => (
              <span key={`${s.at}-${i}`} className="inline-flex items-center gap-1.5">
                {i > 0 && <span className="text-text-muted">then</span>}
                <Badge variant={VARIANT[s.status ?? "Available"] ?? "neutral"} size="sm">{s.status ?? "Available"}</Badge>
                <span className="text-text-muted">{clock(s.at)}</span>
              </span>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
