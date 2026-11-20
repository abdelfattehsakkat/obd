import type { PidDefinition } from '../obd/types';

interface GaugeProps {
  definition: PidDefinition;
  value: number | undefined;
  /** Seuil au-delà duquel l'arc passe en alerte. */
  warnAbove?: number;
  dangerAbove?: number;
}

const START_ANGLE = -216;
const END_ANGLE = 36;
const RADIUS = 62;
const CENTER = 78;

function polar(angleDeg: number, radius: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: CENTER + radius * Math.cos(rad),
    y: CENTER + radius * Math.sin(rad),
  };
}

function arcPath(fromDeg: number, toDeg: number, radius: number): string {
  const start = polar(fromDeg, radius);
  const end = polar(toDeg, radius);
  const largeArc = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x.toFixed(
    2,
  )} ${end.y.toFixed(2)}`;
}

export function Gauge({ definition, value, warnAbove, dangerAbove }: GaugeProps) {
  const hasValue = typeof value === 'number' && Number.isFinite(value);
  const clamped = hasValue
    ? Math.min(definition.max, Math.max(definition.min, value))
    : definition.min;
  const ratio = (clamped - definition.min) / (definition.max - definition.min || 1);
  const angle = START_ANGLE + ratio * (END_ANGLE - START_ANGLE);

  let color = 'var(--accent)';
  if (hasValue && dangerAbove !== undefined && value >= dangerAbove) color = 'var(--danger)';
  else if (hasValue && warnAbove !== undefined && value >= warnAbove) color = 'var(--warn)';

  const ticks = Array.from({ length: 9 }, (_, i) => START_ANGLE + (i / 8) * (END_ANGLE - START_ANGLE));

  return (
    <div className="gauge">
      <svg width="156" height="122" viewBox="0 0 156 122" role="img" aria-label={definition.label}>
        <path
          d={arcPath(START_ANGLE, END_ANGLE, RADIUS)}
          fill="none"
          stroke="var(--surface-3)"
          strokeWidth="9"
          strokeLinecap="round"
        />
        {ticks.map((tick, index) => {
          const outer = polar(tick, RADIUS - 12);
          const inner = polar(tick, RADIUS - 17);
          return (
            <line
              key={index}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke="var(--border-strong)"
              strokeWidth="1.5"
            />
          );
        })}
        {hasValue && ratio > 0.001 && (
          <path
            d={arcPath(START_ANGLE, angle, RADIUS)}
            fill="none"
            stroke={color}
            strokeWidth="9"
            strokeLinecap="round"
            style={{ transition: 'd 0.18s linear' }}
          />
        )}
        {hasValue && (
          <circle cx={polar(angle, RADIUS).x} cy={polar(angle, RADIUS).y} r="4.5" fill={color} />
        )}
      </svg>
      <div className="gauge-value" style={{ color: hasValue ? color : 'var(--text-faint)' }}>
        {hasValue ? value.toFixed(definition.decimals) : '—'}
      </div>
      <div className="gauge-unit">{definition.unit || '\u00a0'}</div>
      <div className="gauge-label" style={{ marginTop: 8, marginBottom: 0 }}>
        {definition.label}
      </div>
    </div>
  );
}
