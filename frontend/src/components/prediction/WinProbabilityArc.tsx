import { useLanguage } from "../../context/LanguageContext";

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
  margin,
  winnerAbbr,
}: WinProbabilityArcProps) {
  const { language } = useLanguage();
  const size = 200;
  const cx = size / 2;
  const cy = size / 2 + 16;
  const r = 78;
  const strokeW = 12;
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

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size - 10} viewBox={`0 0 ${size} ${size - 10}`}>
        <path
          d={arcPath(startAngle, startAngle + totalAngle)}
          fill="none"
          stroke="currentColor"
          className="text-border"
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
          />
        )}
        {homeProb > 0.01 && (
          <path
            d={arcPath(awayEndAngle + gapAngle, homeEndAngle)}
            fill="none"
            stroke={homeColor}
            strokeWidth={strokeW}
            strokeLinecap="round"
          />
        )}
        <text
          x={cx}
          y={cy - 10}
          textAnchor="middle"
          className="fill-text-secondary text-xs font-medium"
        >
          {language === "tr" ? "Beklenen Fark" : "Expected Margin"}
        </text>
        <text
          x={cx}
          y={cy + 14}
          textAnchor="middle"
          className="fill-text-primary text-2xl font-semibold tabular-nums"
        >
          +{Math.abs(margin).toFixed(1)}
        </text>
        <text
          x={cx}
          y={cy + 30}
          textAnchor="middle"
          className="fill-text-secondary text-xs font-medium"
        >
          {language === "tr" ? `${winnerAbbr} Üstünlüğü` : `${winnerAbbr} Advantage`}
        </text>
      </svg>
      <div className="flex justify-between w-full px-4 -mt-1 text-xs">
        <div className="text-left">
          <p className="text-text-secondary font-medium">
            {awayAbbr} {language === "tr" ? "(Dep)" : "(Away)"}
          </p>
          <p className="font-semibold tabular-nums text-text-primary">
            %{(awayProb * 100).toFixed(1)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-text-secondary font-medium">
            {homeAbbr} {language === "tr" ? "(Ev)" : "(Home)"}
          </p>
          <p className="font-semibold tabular-nums text-text-primary">
            %{(homeProb * 100).toFixed(1)}
          </p>
        </div>
      </div>
    </div>
  );
}
