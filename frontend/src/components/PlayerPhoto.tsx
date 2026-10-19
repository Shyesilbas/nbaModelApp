import React from "react";
import { getPlayerHeadshotUrl } from "../lib/nbaTeams";

type Props = {
  playerId: number | string;
  name: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
};

function PlayerPhotoComponent({ playerId, name, size = 44, className = "", style }: Props) {

  const [failed, setFailed] = React.useState(false);
  const src = getPlayerHeadshotUrl(playerId);

  React.useEffect(() => {
    setFailed(false);
  }, [playerId]);

  if (!playerId || failed) {
    return (
      <div
        className={`flex items-center justify-center rounded-full border border-border bg-background-tertiary text-xs font-medium uppercase text-text-muted ${className}`}
        style={{ width: size, height: size, ...style }}
        title={name}
      >
        {name.slice(0, 2)}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      title={name}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      style={style}
      className={`rounded-full object-cover ring-1 ring-border bg-background-primary ${className}`}

      onError={() => setFailed(true)}
    />
  );
}

export default React.memo(PlayerPhotoComponent);
