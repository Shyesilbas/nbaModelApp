export interface TeamInfo {
  name: string;
  abbr: string;
  color: string;
}

export const INJURY_TONE: Record<string, string> = {
  Out: "text-status-error",
  Doubtful: "text-status-warning",
  Questionable: "text-status-warning",
  Probable: "text-text-secondary",
  Available: "text-status-success",
};
