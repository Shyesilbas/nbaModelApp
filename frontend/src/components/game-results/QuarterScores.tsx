export function QuarterScores({
  homeAbbr,
  awayAbbr,
  homeQS,
  awayQS,
}: {
  homeAbbr: string;
  awayAbbr: string;
  homeQS: number[] | null | undefined;
  awayQS: number[] | null | undefined;
}) {
  if (!Array.isArray(homeQS) || !Array.isArray(awayQS) || (homeQS.length === 0 && awayQS.length === 0)) return null;

  const quarters = Math.max(homeQS.length, awayQS.length);
  const cols = Array.from({ length: quarters }, (_, i) => i);

  return (
    <div className="rounded border border-border bg-background-primary p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-text-primary">Quarter scores</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border-light">
              <th className="pb-2 text-left text-xs font-medium text-text-secondary w-16">Team</th>
              {cols.map((i) => (
                <th key={i} className="pb-2 text-center text-xs font-medium text-text-secondary">
                  Q{i + 1}
                </th>
              ))}
              <th className="pb-2 text-center text-xs font-semibold text-text-primary">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-light">
            <tr>
              <td className="py-2 text-left text-xs font-semibold text-text-primary">{homeAbbr}</td>
              {cols.map((i) => (
                <td key={i} className="py-2 text-center text-xs tabular-nums text-text-secondary">{homeQS[i] ?? "-"}</td>
              ))}
              <td className="py-2 text-center text-xs font-semibold tabular-nums text-text-primary">{homeQS.reduce((a, b) => a + b, 0)}</td>
            </tr>
            <tr>
              <td className="py-2 text-left text-xs font-semibold text-text-primary">{awayAbbr}</td>
              {cols.map((i) => (
                <td key={i} className="py-2 text-center text-xs tabular-nums text-text-secondary">{awayQS[i] ?? "-"}</td>
              ))}
              <td className="py-2 text-center text-xs font-semibold tabular-nums text-text-primary">{awayQS.reduce((a, b) => a + b, 0)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
