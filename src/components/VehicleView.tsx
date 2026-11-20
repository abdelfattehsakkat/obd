import { PID_BY_KEY } from '../obd/pids';
import type { ObdController } from '../core/useObd';

export const VEHICLE_PROFILES = {
  generic: 'Générique',
  sonic: 'Chevrolet Sonic T300 1.2',
  aveo: 'Chevrolet Aveo T250 1.2',
} as const;

export type VehicleProfile = keyof typeof VEHICLE_PROFILES;

interface VehicleViewProps {
  controller: ObdController;
  profile: VehicleProfile;
  onProfileChange: (profile: VehicleProfile) => void;
  modelName: string;
  onModelNameChange: (modelName: string) => void;
}

export function VehicleView({ controller, profile, onProfileChange, modelName, onModelNameChange }: VehicleViewProps) {
  const { vehicleInfo, supportedPids, transportInfo } = controller;

  return (
    <div className="stack">
      <div className="card">
        <div className="card-header">
          <span className="card-title">Véhicule déclaré</span>
        </div>
        <div className="card-body grid-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))' }}>
          <label className="stack">
            Profil d’affichage
            <select value={profile} onChange={(event) => onProfileChange(event.target.value as VehicleProfile)}>
              {Object.entries(VEHICLE_PROFILES).map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </label>
          {profile === 'generic' && (
            <label className="stack">
              Modèle déclaré (facultatif)
              <input type="text" value={modelName} onChange={(event) => onModelNameChange(event.target.value)} />
            </label>
          )}
        </div>
      </div>
      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Identification lue</span>
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
