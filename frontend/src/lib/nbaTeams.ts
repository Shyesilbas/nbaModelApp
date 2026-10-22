export const NBA_TEAM_ABBRS = [
  "ATL", "BOS", "BKN", "CHA", "CHI", "CLE", "DAL", "DEN", "DET", "GSW",
  "HOU", "IND", "LAC", "LAL", "MEM", "MIA", "MIL", "MIN", "NOP", "NYK",
  "OKC", "ORL", "PHI", "PHX", "POR", "SAC", "SAS", "TOR", "UTA", "WAS",
] as const;

export type NbaTeamAbbr = (typeof NBA_TEAM_ABBRS)[number];

export const TEAM_NAME_BY_ABBR: Record<NbaTeamAbbr, string> = {
  ATL: "Atlanta Hawks",
  BOS: "Boston Celtics",
  BKN: "Brooklyn Nets",
  CHA: "Charlotte Hornets",
  CHI: "Chicago Bulls",
  CLE: "Cleveland Cavaliers",
  DAL: "Dallas Mavericks",
  DEN: "Denver Nuggets",
  DET: "Detroit Pistons",
  GSW: "Golden State Warriors",
  HOU: "Houston Rockets",
  IND: "Indiana Pacers",
  LAC: "LA Clippers",
  LAL: "Los Angeles Lakers",
  MEM: "Memphis Grizzlies",
  MIA: "Miami Heat",
  MIL: "Milwaukee Bucks",
  MIN: "Minnesota Timberwolves",
  NOP: "New Orleans Pelicans",
  NYK: "New York Knicks",
  OKC: "Oklahoma City Thunder",
  ORL: "Orlando Magic",
  PHI: "Philadelphia 76ers",
  PHX: "Phoenix Suns",
  POR: "Portland Trail Blazers",
  SAC: "Sacramento Kings",
  SAS: "San Antonio Spurs",
  TOR: "Toronto Raptors",
  UTA: "Utah Jazz",
  WAS: "Washington Wizards",
};

export const TEAM_SHORT_NAME_BY_ABBR: Record<NbaTeamAbbr, string> = {
  ATL: "Hawks",
  BOS: "Celtics",
  BKN: "Nets",
  CHA: "Hornets",
  CHI: "Bulls",
  CLE: "Cavaliers",
  DAL: "Mavericks",
  DEN: "Nuggets",
  DET: "Pistons",
  GSW: "Warriors",
  HOU: "Rockets",
  IND: "Pacers",
  LAC: "Clippers",
  LAL: "Lakers",
  MEM: "Grizzlies",
  MIA: "Heat",
  MIL: "Bucks",
  MIN: "Timberwolves",
  NOP: "Pelicans",
  NYK: "Knicks",
  OKC: "Thunder",
  ORL: "Magic",
  PHI: "76ers",
  PHX: "Suns",
  POR: "Trail Blazers",
  SAC: "Kings",
  SAS: "Spurs",
  TOR: "Raptors",
  UTA: "Jazz",
  WAS: "Wizards",
};

export const getTeamShortName = (abbr?: string | null, fallback?: string | null): string => {
  if (!abbr) return fallback ?? "";
  const upper = abbr.toUpperCase();
  if (isKnownTeamAbbr(upper)) {
    return TEAM_SHORT_NAME_BY_ABBR[upper];
  }
  return fallback ?? abbr;
};

export interface TeamTheme {
  primary: string;
  secondary: string;
  accent: string;
  badgeBg: string;
  badgeText: string;
  glow: string;
}

export const TEAM_THEME_BY_ABBR: Record<NbaTeamAbbr, TeamTheme> = {
  ATL: { primary: "#E03A3E", secondary: "#C1D32F", accent: "#E03A3E", badgeBg: "rgba(224, 58, 62, 0.12)", badgeText: "#E03A3E", glow: "rgba(224, 58, 62, 0.35)" },
  BOS: { primary: "#007A33", secondary: "#BA9653", accent: "#007A33", badgeBg: "rgba(0, 122, 51, 0.12)", badgeText: "#007A33", glow: "rgba(0, 122, 51, 0.35)" },
  BKN: { primary: "#000000", secondary: "#707271", accent: "#333333", badgeBg: "rgba(0, 0, 0, 0.08)", badgeText: "#111111", glow: "rgba(0, 0, 0, 0.30)" },
  CHA: { primary: "#1D1160", secondary: "#00788C", accent: "#00788C", badgeBg: "rgba(0, 120, 140, 0.12)", badgeText: "#00788C", glow: "rgba(0, 120, 140, 0.35)" },
  CHI: { primary: "#CE1141", secondary: "#000000", accent: "#CE1141", badgeBg: "rgba(206, 17, 65, 0.12)", badgeText: "#CE1141", glow: "rgba(206, 17, 65, 0.35)" },
  CLE: { primary: "#860038", secondary: "#FDBB30", accent: "#860038", badgeBg: "rgba(134, 0, 56, 0.12)", badgeText: "#860038", glow: "rgba(134, 0, 56, 0.35)" },
  DAL: { primary: "#00538C", secondary: "#B8C4CA", accent: "#00538C", badgeBg: "rgba(0, 83, 140, 0.12)", badgeText: "#00538C", glow: "rgba(0, 83, 140, 0.35)" },
  DEN: { primary: "#0E2240", secondary: "#FEC524", accent: "#FEC524", badgeBg: "rgba(14, 34, 64, 0.12)", badgeText: "#0E2240", glow: "rgba(254, 197, 36, 0.35)" },
  DET: { primary: "#1D42BA", secondary: "#C8102E", accent: "#1D42BA", badgeBg: "rgba(29, 66, 186, 0.12)", badgeText: "#1D42BA", glow: "rgba(29, 66, 186, 0.35)" },
  GSW: { primary: "#1D428A", secondary: "#FFC72C", accent: "#FFC72C", badgeBg: "rgba(29, 66, 138, 0.12)", badgeText: "#1D428A", glow: "rgba(255, 199, 44, 0.40)" },
  HOU: { primary: "#CE1141", secondary: "#000000", accent: "#CE1141", badgeBg: "rgba(206, 17, 65, 0.12)", badgeText: "#CE1141", glow: "rgba(206, 17, 65, 0.35)" },
  IND: { primary: "#002D62", secondary: "#FDBB30", accent: "#FDBB30", badgeBg: "rgba(0, 45, 98, 0.12)", badgeText: "#002D62", glow: "rgba(253, 187, 48, 0.35)" },
  LAC: { primary: "#C8102E", secondary: "#1D428A", accent: "#1D428A", badgeBg: "rgba(200, 16, 46, 0.12)", badgeText: "#C8102E", glow: "rgba(200, 16, 46, 0.35)" },
  LAL: { primary: "#552583", secondary: "#FDB927", accent: "#FDB927", badgeBg: "rgba(85, 37, 131, 0.12)", badgeText: "#552583", glow: "rgba(253, 185, 39, 0.40)" },
  MEM: { primary: "#12173F", secondary: "#5D76A9", accent: "#5D76A9", badgeBg: "rgba(93, 118, 169, 0.12)", badgeText: "#5D76A9", glow: "rgba(93, 118, 169, 0.35)" },
  MIA: { primary: "#98002E", secondary: "#F9A01B", accent: "#98002E", badgeBg: "rgba(152, 0, 46, 0.12)", badgeText: "#98002E", glow: "rgba(152, 0, 46, 0.35)" },
  MIL: { primary: "#00471B", secondary: "#EEE1C6", accent: "#00471B", badgeBg: "rgba(0, 71, 27, 0.12)", badgeText: "#00471B", glow: "rgba(0, 71, 27, 0.35)" },
  MIN: { primary: "#0C2340", secondary: "#78BE20", accent: "#78BE20", badgeBg: "rgba(12, 35, 64, 0.12)", badgeText: "#0C2340", glow: "rgba(120, 190, 32, 0.40)" },
  NOP: { primary: "#0C2340", secondary: "#C8102E", accent: "#B4975A", badgeBg: "rgba(12, 35, 64, 0.12)", badgeText: "#0C2340", glow: "rgba(180, 151, 90, 0.35)" },
  NYK: { primary: "#006BB6", secondary: "#F58426", accent: "#F58426", badgeBg: "rgba(0, 107, 182, 0.12)", badgeText: "#006BB6", glow: "rgba(245, 132, 38, 0.35)" },
  OKC: { primary: "#007AC1", secondary: "#EF3B24", accent: "#007AC1", badgeBg: "rgba(0, 122, 193, 0.12)", badgeText: "#007AC1", glow: "rgba(0, 122, 193, 0.35)" },
  ORL: { primary: "#0077C0", secondary: "#C4CED4", accent: "#0077C0", badgeBg: "rgba(0, 119, 192, 0.12)", badgeText: "#0077C0", glow: "rgba(0, 119, 192, 0.35)" },
  PHI: { primary: "#006BB6", secondary: "#ED174C", accent: "#006BB6", badgeBg: "rgba(0, 107, 182, 0.12)", badgeText: "#006BB6", glow: "rgba(0, 107, 182, 0.35)" },
  PHX: { primary: "#1D1160", secondary: "#E56020", accent: "#E56020", badgeBg: "rgba(229, 96, 32, 0.12)", badgeText: "#E56020", glow: "rgba(229, 96, 32, 0.35)" },
  POR: { primary: "#E03A3E", secondary: "#000000", accent: "#E03A3E", badgeBg: "rgba(224, 58, 62, 0.12)", badgeText: "#E03A3E", glow: "rgba(224, 58, 62, 0.35)" },
  SAC: { primary: "#5A2D81", secondary: "#63727A", accent: "#5A2D81", badgeBg: "rgba(90, 45, 129, 0.12)", badgeText: "#5A2D81", glow: "rgba(90, 45, 129, 0.35)" },
  SAS: { primary: "#000000", secondary: "#C4CED4", accent: "#C4CED4", badgeBg: "rgba(0, 0, 0, 0.08)", badgeText: "#111111", glow: "rgba(196, 206, 212, 0.35)" },
  TOR: { primary: "#CE1141", secondary: "#000000", accent: "#CE1141", badgeBg: "rgba(206, 17, 65, 0.12)", badgeText: "#CE1141", glow: "rgba(206, 17, 65, 0.35)" },
  UTA: { primary: "#002B5C", secondary: "#F9A01B", accent: "#002B5C", badgeBg: "rgba(0, 43, 92, 0.12)", badgeText: "#002B5C", glow: "rgba(249, 160, 27, 0.35)" },
  WAS: { primary: "#0C2340", secondary: "#E31837", accent: "#E31837", badgeBg: "rgba(227, 24, 55, 0.12)", badgeText: "#E31837", glow: "rgba(227, 24, 55, 0.35)" },
};

export const getTeamTheme = (abbr?: string | null): TeamTheme => {
  const upper = abbr?.toUpperCase() as NbaTeamAbbr;
  return (
    TEAM_THEME_BY_ABBR[upper] || {
      primary: "#1D428A",
      secondary: "#64748B",
      accent: "#1D428A",
      badgeBg: "rgba(29, 66, 138, 0.12)",
      badgeText: "#1D428A",
      glow: "rgba(29, 66, 138, 0.30)",
    }
  );
};

export const NBA_TEAMS = NBA_TEAM_ABBRS.map((abbr) => ({
  abbr,
  name: TEAM_NAME_BY_ABBR[abbr],
  shortName: TEAM_SHORT_NAME_BY_ABBR[abbr],
  color: TEAM_THEME_BY_ABBR[abbr].primary,
  secondaryColor: TEAM_THEME_BY_ABBR[abbr].secondary,
}));

export const getTeamLogoUrl = (abbr: string) => {
  const upper = abbr.toUpperCase();
  if (upper === "UTA") {
    return "https://cdn.nba.com/logos/nba/1610612762/primary/L/logo.svg";
  }
  if (upper === "NOP") {
    return "https://a.espncdn.com/i/teamlogos/nba/500/no.png";
  }
  return `https://a.espncdn.com/i/teamlogos/nba/500/${abbr.toLowerCase()}.png`;
};
export const getPlayerHeadshotUrl = (playerId: number | string) =>
  `https://ak-static.cms.nba.com/wp-content/uploads/headshots/nba/latest/260x190/${playerId}.png`;

export const isKnownTeamAbbr = (abbr: string): abbr is NbaTeamAbbr =>
  (NBA_TEAM_ABBRS as readonly string[]).includes(abbr as NbaTeamAbbr);
