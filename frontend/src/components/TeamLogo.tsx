import React from "react";
import { getTeamLogoUrl, isKnownTeamAbbr } from "../lib/nbaTeams";

type Props = {
  abbr: string;
  name?: string | null;
  size?: number;
  className?: string;
  fallbackClassName?: string;
};

function TeamLogoComponent({ abbr, name, size = 36, className = "", fallbackClassName = "" }: Props) {
  const [failedAbbr, setFailedAbbr] = React.useState<string | null>(null);
  const label = name || abbr;
  const src = isKnownTeamAbbr(abbr) ? getTeamLogoUrl(abbr) : "";
  const failed = !src || failedAbbr === abbr;

  if (failed) {
    return (
      <div
        className={`team-logo-fallback ${fallbackClassName}`}
        style={{ width: size, height: size }}
        aria-label={label}
        title={label}
      >
        {abbr}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={label}
      title={label}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className={`team-logo-image ${className}`}
      onError={() => setFailedAbbr(abbr)}
    />
  );
}

export default React.memo(TeamLogoComponent);

