import { Gauge } from './Gauge';
import { LineChart } from './LineChart';
import { PID_BY_KEY } from '../obd/pids';
import type { ObdController } from '../core/useObd';

const HERO_GAUGES: Array<{ key: string; warnAbove?: number; dangerAbove?: number }> = [
  { key: '01:0C', warnAbove: 4200, dangerAbove: 5200 },
  { key: '01:0D', warnAbove: 130, dangerAbove: 160 },
  { key: '01:05', warnAbove: 105, dangerAbove: 115 },
  { key: '01:04', warnAbove: 85, dangerAbove: 95 },
];

const CHART_SERIES: Array<{ key: string; color: string }> = [
  { key: '01:0C', color: '#22d3ee' },
  { key: '01:0D', color: '#a78bfa' },
  { key: '01:11', color: '#fbbf24' },
];

const SECONDARY = ['01:0F', '01:10', '01:0B', '01:42', '01:2F', '01:5C'];

export function DashboardView({ controller }: { controller: ObdController }) {
  const { samples, history, monitorStatus, vehicleInfo } = controller;

  return (
    <div className="stack">
      {monitorStatus && (
        <div className={`alert ${monitorStatus.milOn ? 'alert-warn' : 'alert-info'}`}>
          <strong style={{ flex: '0 0 auto' }}>
            {monitorStatus.milOn ? '⚠ Témoin moteur allumé' : '✓ Témoin moteur éteint'}
          </strong>
          <span>
            {monitorStatus.dtcCount > 0
              ? `${monitorStatus.dtcCount} code(s) défaut confirmé(s) en mémoire. Ouvrez l’onglet « Codes défauts » pour le détail.`
              : 'Aucun code défaut confirmé remonté par le calculateur.'}
          </span>
        </div>
      )}

      <div className="gauge-grid">
        {HERO_GAUGES.map((item) => {
          const definition = PID_BY_KEY.get(item.key);
          if (!definition) return null;
          return (
            <Gauge
              key={item.key}
              definition={definition}
              value={samples[item.key]?.value}
              warnAbove={item.warnAbove}
              dangerAbove={item.dangerAbove}
            />
          );
        })}
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Courbes temps réel</span>
          <div className="topbar-spacer" />
          {CHART_SERIES.map((s) => {
            const definition = PID_BY_KEY.get(s.key);
            if (!definition) return null;
            return (
              <span key={s.key} className="row" style={{ gap: 6, fontSize: 11 }}>
                <span
                  className="dot"
                  style={{ color: s.color, width: 8, height: 8, background: s.color }}
                />
                <span className="dim">{definition.label}</span>
              </span>
            );
          })}
        </div>
        <div style={{ padding: '6px 10px 0' }}>
          <LineChart
            series={CHART_SERIES.flatMap((s) => {
              const definition = PID_BY_KEY.get(s.key);
              if (!definition) return [];
              return [
                {
                  key: s.key,
                  label: definition.label,
                  unit: definition.unit,
                  color: s.color,
                  points: history[s.key] ?? [],
                  min: definition.min,
                  max: definition.max,
                },
              ];
            })}
          />
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Paramètres secondaires</span>
          </div>
          <table className="data">
            <tbody>
              {SECONDARY.map((key) => {
                const definition = PID_BY_KEY.get(key);
                if (!definition) return null;
                const sample = samples[key];
                return (
                  <tr key={key}>
                    <td className="dim">{definition.label}</td>
                    <td className="num" style={{ width: 110 }}>
                      {sample ? sample.value.toFixed(definition.decimals) : '—'}
                    </td>
                    <td className="muted" style={{ width: 60, fontSize: 12 }}>
                      {definition.unit}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Identification</span>
          </div>
          <div className="card-body">
            <dl className="kv">
              <dt>VIN</dt>
              <dd>{vehicleInfo.vin ?? '—'}</dd>
              <dt>Protocole</dt>
              <dd>{vehicleInfo.protocol ?? '—'}</dd>
              <dt>Calculateur</dt>
              <dd>{vehicleInfo.ecuName ?? '—'}</dd>
              <dt>Tension adaptateur</dt>
              <dd>
                {vehicleInfo.batteryVoltage !== undefined
                  ? `${vehicleInfo.batteryVoltage.toFixed(1)} V`
                  : '—'}
              </dd>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
