import React from "react";
import { getPlayerHeadshotUrl } from "../lib/nbaTeams";

type Props = {
  playerId: number | string;
  name: string;
  size?: number;
  className?: string;
};

function PlayerPhotoComponent({ playerId, name, size = 44, className = "" }: Props) {
  const [failed, setFailed] = React.useState(false);
  const src = getPlayerHeadshotUrl(playerId);

  React.useEffect(() => {
    setFailed(false);
  }, [playerId]);

  if (!playerId || failed) {
    return (
      <div
        className={`flex items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 ${className}`}
        style={{ width: size, height: size }}
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
      className={`rounded-full object-cover ring-1 ring-slate-200 bg-white ${className}`}
      onError={() => setFailed(true)}
    />
  );
}

export default React.memo(PlayerPhotoComponent);
