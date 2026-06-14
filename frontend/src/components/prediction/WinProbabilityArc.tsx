interface WinProbabilityArcProps {
  homeProb: number;
  awayProb: number;
  homeColor: string;
  awayColor: string;
  homeAbbr: string;
  awayAbbr: string;
  confidence: string;
  margin: number;
  winnerAbbr: string;
}

export function WinProbabilityArc({
  homeProb,
  awayProb,
  homeColor,
  awayColor,
  homeAbbr,
  awayAbbr,
  confidence,
  margin,
  winnerAbbr,
}: WinProbabilityArcProps) {
  const size = 220;
  const cx = size / 2;
  const cy = size / 2 + 20;
  const r = 88;
  const strokeW = 14;
  const startAngle = -200;
  const totalAngle = 220;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const polarToXY = (angle: number) => ({
    x: cx + r * Math.cos(toRad(angle)),
    y: cy + r * Math.sin(toRad(angle)),
  });

  const arcPath = (startDeg: number, endDeg: number) => {
    const s = polarToXY(startDeg);
    const e = polarToXY(endDeg);
    const largeArc = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${largeArc} 1 ${e.x} ${e.y}`;
  };

  const awayEndAngle = startAngle + totalAngle * awayProb;
  const homeEndAngle = awayEndAngle + totalAngle * homeProb;
  const gapAngle = 1;

  const confColor =
    confidence?.toUpperCase().includes("STRONG")
      ? "#10b981"
      : confidence?.toUpperCase().includes("MODERATE")
        ? "#3b82f6"
        : "#f59e0b";

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size - 10} viewBox={`0 0 ${size} ${size - 10}`}>
        <path
          d={arcPath(startAngle, startAngle + totalAngle)}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={strokeW}
          strokeLinecap="round"
        />
        {awayProb > 0.01 && (
          <path
            d={arcPath(startAngle, awayEndAngle - gapAngle)}
            fill="none"
            stroke={awayColor}
            strokeWidth={strokeW}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 6px ${awayColor}66)` }}
          />
        )}
        {homeProb > 0.01 && (
          <path
            d={arcPath(awayEndAngle + gapAngle, homeEndAngle)}
            fill="none"
            stroke={homeColor}
            strokeWidth={strokeW}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 6px ${homeColor}66)` }}
          />
        )}
        <circle cx={cx} cy={cy} r={r - strokeW - 10} fill="none" stroke={confColor} strokeWidth={2} strokeOpacity={0.25} />
        <text x={cx} y={cy - 12} textAnchor="middle" fill="white" fontSize="11" fontWeight="800" letterSpacing="2" fontFamily="monospace" opacity={0.5}>
          MARGIN
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fill="white" fontSize="26" fontWeight="900" fontFamily="'Barlow Condensed', sans-serif">
          {Math.abs(margin).toFixed(1)}
        </text>
        <text x={cx} y={cy + 32} textAnchor="middle" fill="white" fontSize="10" fontWeight="700" opacity={0.5} fontFamily="monospace">
          {winnerAbbr} LEAD
        </text>
      </svg>
      <div className="flex justify-between w-full px-2 -mt-1">
        <div className="text-center">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Away</p>
          <p className="text-base font-black font-mono" style={{ color: awayColor }}>
            {(awayProb * 100).toFixed(1)}%
          </p>
          <p className="text-[9px] text-white/50 font-bold">{awayAbbr}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Home</p>
          <p className="text-base font-black font-mono" style={{ color: homeColor }}>
            {(homeProb * 100).toFixed(1)}%
          </p>
          <p className="text-[9px] text-white/50 font-bold">{homeAbbr}</p>
        </div>
      </div>
    </div>
  );
}
