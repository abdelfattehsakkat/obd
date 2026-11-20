import { useMemo, useState } from 'react';
import { Sparkline } from './LineChart';
import { PID_DEFINITIONS } from '../obd/pids';
import type { ObdController } from '../core/useObd';
import type { SensorCategory } from '../obd/types';

const CATEGORY_LABELS: Record<SensorCategory, string> = {
  moteur: 'Moteur',
  admission: 'Admission',
  carburant: 'Carburant',
  temperature: 'Températures',
  electrique: 'Électrique',
  vehicule: 'Véhicule',
  emissions: 'Émissions',
};

export function LiveDataView({ controller }: { controller: ObdController }) {
  const { samples, history, supportedPids, polledKeys, togglePolledKey, setPolledKeys } =
    controller;
  const [onlySupported, setOnlySupported] = useState(true);

  const supportedSet = useMemo(() => new Set(supportedPids), [supportedPids]);

  const rows = useMemo(() => {
    const list = PID_DEFINITIONS.filter(
      (d) => !onlySupported || supportedSet.size === 0 || supportedSet.has(d.key),
    );
    return [...list].sort(
      (a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label),
    );
  }, [onlySupported, supportedSet]);

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Données temps réel — mode 01</span>
        <div className="topbar-spacer" />
        <label className="row" style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          <input
            type="checkbox"
            className="checkbox"
            checked={onlySupported}
            onChange={(e) => setOnlySupported(e.target.checked)}
          />
          Capteurs supportés uniquement
        </label>
        <button
          className="btn btn-sm"
          onClick={() => setPolledKeys(rows.map((r) => r.key))}
          disabled={rows.length === 0}
        >
          Tout acquérir
        </button>
        <button className="btn btn-sm" onClick={() => setPolledKeys([])}>
          Tout arrêter
        </button>
      </div>

      <div className="scroll-y" style={{ maxHeight: 'calc(100vh - 220px)' }}>
        <table className="data">
          <thead>
            <tr>
              <th style={{ width: 44 }}>Acq.</th>
              <th style={{ width: 66 }}>PID</th>
              <th>Paramètre</th>
              <th style={{ width: 110 }}>Catégorie</th>
              <th className="num" style={{ width: 100 }}>
                Valeur
              </th>
              <th style={{ width: 60 }}>Unité</th>
              <th style={{ width: 100 }}>Tendance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((definition) => {
              const sample = samples[definition.key];
              const polled = polledKeys.includes(definition.key);
              return (
                <tr key={definition.key}>
                  <td>
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={polled}
                      onChange={() => togglePolledKey(definition.key)}
                      aria-label={`Acquérir ${definition.label}`}
                    />
                  </td>
                  <td className="num muted" style={{ textAlign: 'left' }}>
                    {definition.key.replace(':', ' ')}
                  </td>
                  <td>
                    <div>{definition.label}</div>
                    <div className="dtc-meta">{definition.description}</div>
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {CATEGORY_LABELS[definition.category]}
                  </td>
                  <td className="num" style={{ fontSize: 15 }}>
                    {sample ? (
                      sample.text ?? sample.value.toFixed(definition.decimals)
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {definition.unit}
                  </td>
                  <td>
                    <Sparkline
                      points={history[definition.key] ?? []}
                      min={definition.min}
                      max={definition.max}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
