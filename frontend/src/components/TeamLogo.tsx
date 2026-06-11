import React from "react";
import { getTeamLogoUrl, isKnownTeamAbbr } from "../lib/nbaTeams";

type Props = {
  abbr: string;
  name?: string | null;
  size?: number;
  className?: string;
  fallbackClassName?: string;
};

export default function TeamLogo({ abbr, name, size = 36, className = "", fallbackClassName = "" }: Props) {
  const [failed, setFailed] = React.useState(false);
  const label = name ?? abbr;
  const src = isKnownTeamAbbr(abbr) ? getTeamLogoUrl(abbr) : "";

  if (!src || failed) {
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
      onError={() => setFailed(true)}
    />
  );
}

