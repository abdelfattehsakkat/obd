import { PID_BY_KEY } from '../obd/pids';
import type { ObdController } from '../core/useObd';

export function VehicleView({ controller }: { controller: ObdController }) {
  const { vehicleInfo, supportedPids, transportInfo } = controller;

  return (
    <div className="stack">
      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Véhicule</span>
          </div>
          <div className="card-body">
            <dl className="kv">
              <dt>Numéro de série (VIN)</dt>
              <dd>{vehicleInfo.vin ?? 'Non communiqué'}</dd>
              <dt>Identifiant de calibration</dt>
              <dd>{vehicleInfo.calibrationId ?? 'Non communiqué'}</dd>
              <dt>Nom du calculateur</dt>
              <dd>{vehicleInfo.ecuName ?? 'Non communiqué'}</dd>
              <dt>Protocole de diagnostic</dt>
              <dd>{vehicleInfo.protocol ?? 'Inconnu'}</dd>
            </dl>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Adaptateur</span>
          </div>
          <div className="card-body">
            <dl className="kv">
              <dt>Interface</dt>
              <dd>{transportInfo?.label ?? '—'}</dd>
              <dt>Périphérique</dt>
              <dd>{transportInfo?.deviceName ?? '—'}</dd>
              <dt>Profil / liaison</dt>
              <dd>{transportInfo?.detail ?? '—'}</dd>
              <dt>Firmware</dt>
              <dd>{vehicleInfo.adapterVersion ?? '—'}</dd>
              <dt>Tension mesurée</dt>
              <dd>
                {vehicleInfo.batteryVoltage !== undefined
                  ? `${vehicleInfo.batteryVoltage.toFixed(1)} V`
                  : '—'}
              </dd>
            </dl>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">
            Capteurs déclarés par le calculateur ({supportedPids.length})
          </span>
        </div>
        <div className="card-body">
          {supportedPids.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              Aucune découverte effectuée. Connectez-vous à un adaptateur.
            </p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {supportedPids.map((key) => (
                <span key={key} className="badge badge-neutral" style={{ textTransform: 'none' }}>
                  {key.replace(':', ' ')} · {PID_BY_KEY.get(key)?.label ?? 'inconnu'}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
