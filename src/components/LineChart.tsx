import { useId } from 'react';
import type { HistoryPoint } from '../core/useObd';

interface LineChartProps {
  series: Array<{
    key: string;
    label: string;
    unit: string;
    color: string;
    points: HistoryPoint[];
    min: number;
    max: number;
  }>;
  height?: number;
}

const PADDING = { top: 14, right: 12, bottom: 22, left: 46 };

/** Graphique temporel léger (SVG pur, sans dépendance externe). */
export function LineChart({ series, height = 220 }: LineChartProps) {
  const gradientId = useId();
  const width = 900;
  const plotWidth = width - PADDING.left - PADDING.right;
  const plotHeight = height - PADDING.top - PADDING.bottom;

  const active = series.filter((s) => s.points.length > 1);

  if (active.length === 0) {
    return (
      <div className="empty" style={{ padding: '58px 20px' }}>
        <p>En attente de données d’acquisition…</p>
      </div>
    );
  }

  const allTimes = active.flatMap((s) => s.points.map((p) => p.t));
  const tMin = Math.min(...allTimes);
  const tMax = Math.max(...allTimes);
  const tSpan = Math.max(1, tMax - tMin);

  // Échelle Y normalisée : chaque série est ramenée sur sa propre plage,
  // ce qui permet de superposer des grandeurs d'unités différentes.
  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      role="img"
      aria-label="Graphique temporel des capteurs"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={active[0].color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={active[0].color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {gridLines.map((g) => {
        const y = PADDING.top + g * plotHeight;
        return (
          <g key={g}>
            <line
              x1={PADDING.left}
              y1={y}
              x2={width - PADDING.right}
              y2={y}
              stroke="var(--border)"
              strokeWidth="1"
              strokeDasharray={g === 1 ? '0' : '3 5'}
            />
            <text
              x={PADDING.left - 8}
              y={y + 3.5}
              textAnchor="end"
              fontSize="10"
              fill="var(--text-faint)"
              fontFamily="var(--mono)"
            >
              {(active[0].min + (1 - g) * (active[0].max - active[0].min)).toFixed(0)}
            </text>
          </g>
        );
      })}

      {active.map((s, index) => {
        const span = s.max - s.min || 1;
        const coords = s.points.map((p) => {
          const x = PADDING.left + ((p.t - tMin) / tSpan) * plotWidth;
          const norm = Math.min(1, Math.max(0, (p.v - s.min) / span));
          const y = PADDING.top + (1 - norm) * plotHeight;
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        });

        return (
          <g key={s.key}>
            {index === 0 && (
              <polygon
                points={`${PADDING.left},${PADDING.top + plotHeight} ${coords.join(' ')} ${
                  PADDING.left + plotWidth
                },${PADDING.top + plotHeight}`}
                fill={`url(#${gradientId})`}
              />
            )}
            <polyline
              points={coords.join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth="1.8"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        );
      })}

      <text
        x={PADDING.left}
        y={height - 6}
        fontSize="10"
        fill="var(--text-faint)"
        fontFamily="var(--mono)"
      >
        -{Math.round(tSpan / 1000)}s
      </text>
      <text
        x={width - PADDING.right}
        y={height - 6}
        textAnchor="end"
        fontSize="10"
        fill="var(--text-faint)"
        fontFamily="var(--mono)"
      >
        maintenant
      </text>
    </svg>
  );
}

/** Micro-courbe utilisée dans les tableaux de données. */
export function Sparkline({
  points,
  min,
  max,
  color = 'var(--accent)',
}: {
  points: HistoryPoint[];
  min: number;
  max: number;
  color?: string;
}) {
  if (points.length < 2) return <span className="muted">—</span>;

  const width = 90;
  const height = 22;
  const span = max - min || 1;
  const slice = points.slice(-60);
  const coords = slice.map((p, i) => {
    const x = (i / (slice.length - 1)) * width;
    const norm = Math.min(1, Math.max(0, (p.v - min) / span));
    return `${x.toFixed(1)},${(height - norm * height).toFixed(1)}`;
  });

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline
        points={coords.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
