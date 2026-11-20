import { useMemo, useState } from 'react';
import { useObd } from './core/useObd';
import { DashboardView } from './components/DashboardView';
import { LiveDataView } from './components/LiveDataView';
import { DtcView } from './components/DtcView';
import { VehicleView, VEHICLE_PROFILES, type VehicleProfile } from './components/VehicleView';
import { TerminalView } from './components/TerminalView';
import type { TransportKind } from './transport/Transport';
import type { ConnectionState } from './obd/types';

type ViewId = 'dashboard' | 'live' | 'dtc' | 'vehicle' | 'terminal';

const VIEWS: Array<{ id: ViewId; label: string; icon: string }> = [
  { id: 'dashboard', label: 'Tableau de bord', icon: '◉' },
  { id: 'live', label: 'Données temps réel', icon: '≋' },
  { id: 'dtc', label: 'Codes défauts', icon: '⚠' },
  { id: 'vehicle', label: 'Véhicule & adaptateur', icon: '⛭' },
  { id: 'terminal', label: 'Console', icon: '›_' },
];

const STATE_META: Record<ConnectionState, { label: string; badge: string; pulse: boolean }> = {
  disconnected: { label: 'Déconnecté', badge: 'badge-neutral', pulse: false },
  connecting: { label: 'Connexion…', badge: 'badge-warn', pulse: true },
  initializing: { label: 'Initialisation…', badge: 'badge-warn', pulse: true },
  ready: { label: 'En ligne', badge: 'badge-ok', pulse: false },
  error: { label: 'Erreur', badge: 'badge-danger', pulse: false },
};

export default function App() {
  const controller = useObd();
  const [view, setView] = useState<ViewId>('dashboard');
  const [profile, setProfile] = useState<VehicleProfile>('generic');
  const [modelName, setModelName] = useState('');
  const [transportKind, setTransportKind] = useState<TransportKind>('demo');
  const [bridgeUrl, setBridgeUrl] = useState('ws://127.0.0.1:8787');

  const stateMeta = STATE_META[controller.state];
  const busy = controller.state === 'connecting' || controller.state === 'initializing';
  const connected = controller.state === 'ready';

  const dtcBadge = useMemo(() => {
    const confirmed = controller.dtcs.filter((d) => d.kind === 'stored').length;
    if (confirmed > 0) return { text: String(confirmed), className: 'badge-danger' };
    if (controller.monitorStatus?.milOn) return { text: '!', className: 'badge-warn' };
    return null;
  }, [controller.dtcs, controller.monitorStatus]);

  const activeSensors = Object.keys(controller.samples).length;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">OS</span>
          <span>
            OBD SCOPE
            <small>DIAGNOSTIC LECTURE SEULE</small>
          </span>
        </div>

        <div className="topbar-spacer" />

        <div className="readonly-shield" title="Toute commande d'écriture vers le véhicule est bloquée.">
          <span>🔒</span> LECTURE SEULE
        </div>

        <select
          value={transportKind}
          onChange={(e) => setTransportKind(e.target.value as TransportKind)}
          disabled={connected || busy}
          aria-label="Type de connexion"
        >
          <option value="demo">Banc virtuel (démo)</option>
          <option value="ble" disabled={!controller.bleAvailable}>
            Bluetooth LE {controller.bleAvailable ? '' : '(non supporté)'}
          </option>
          <option value="bridge">Bridge série (Bluetooth classique / USB)</option>
        </select>

        {transportKind === 'bridge' && !connected && (
          <input
            type="text"
            value={bridgeUrl}
            onChange={(e) => setBridgeUrl(e.target.value)}
            style={{ width: 190, fontFamily: 'var(--mono)', fontSize: 12 }}
            aria-label="URL du bridge"
          />
        )}

        <span className={`badge ${stateMeta.badge}`}>
          <span className={`dot ${stateMeta.pulse ? 'dot-pulse' : ''}`} />
          {stateMeta.label}
        </span>

        {connected ? (
          <button className="btn btn-danger" onClick={() => void controller.disconnect()}>
            Déconnecter
          </button>
        ) : (
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void controller.connect(transportKind, bridgeUrl)}
          >
            {busy ? 'Connexion…' : 'Connecter'}
          </button>
        )}
      </header>

      <nav className="nav">
        <div className="nav-group-title">Diagnostic</div>
        {VIEWS.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${view === item.id ? 'active' : ''}`}
            onClick={() => setView(item.id)}
          >
            <span style={{ width: 16, textAlign: 'center', opacity: 0.75 }}>{item.icon}</span>
            {item.label}
            {item.id === 'dtc' && dtcBadge && (
              <span className={`badge ${dtcBadge.className}`}>{dtcBadge.text}</span>
            )}
          </button>
        ))}

        <div className="nav-group-title">Session</div>
        <div style={{ padding: '4px 10px', fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.9 }}>
          <div>
            Profil : <b style={{ color: 'var(--text-dim)', overflowWrap: 'anywhere' }}>
              {profile === 'generic' ? modelName.trim() || VEHICLE_PROFILES.generic : VEHICLE_PROFILES[profile]}
            </b>
          </div>
          <div>
            Capteurs actifs : <b style={{ color: 'var(--text-dim)' }}>{activeSensors}</b>
          </div>
          <div>
            En acquisition : <b style={{ color: 'var(--text-dim)' }}>{controller.polledKeys.length}</b>
          </div>
          <div>
            Trames : <b style={{ color: 'var(--text-dim)' }}>{controller.logs.length}</b>
          </div>
        </div>
      </nav>

      <main className="main">
        {controller.error && (
          <div className="alert alert-error" style={{ marginBottom: 14 }}>
            <strong style={{ flex: '0 0 auto' }}>Erreur</strong>
            <span>{controller.error}</span>
          </div>
        )}

        {view === 'vehicle' ? (
          <VehicleView
            controller={controller}
            profile={profile}
            onProfileChange={setProfile}
            modelName={modelName}
            onModelNameChange={setModelName}
          />
        ) : controller.state === 'disconnected' && !controller.error ? (
          <WelcomePanel bleAvailable={controller.bleAvailable} />
        ) : (
          <>
            {view === 'dashboard' && <DashboardView controller={controller} />}
            {view === 'live' && <LiveDataView controller={controller} />}
            {view === 'dtc' && <DtcView controller={controller} />}
            {view === 'terminal' && <TerminalView controller={controller} />}
          </>
        )}
      </main>

      <footer className="statusbar">
        <span>
          <b>Interface</b> {controller.transportInfo?.label ?? '—'}
        </span>
        <span>
          <b>Périphérique</b> {controller.transportInfo?.deviceName ?? '—'}
        </span>
        <span>
          <b>Protocole</b> {controller.vehicleInfo.protocol ?? '—'}
        </span>
        <span>
          <b>VIN</b> {controller.vehicleInfo.vin ?? '—'}
        </span>
        <div className="topbar-spacer" />
        <span style={{ color: 'var(--ok)' }}>Modes autorisés : 01 · 02 · 03 · 06 · 07 · 09 · 0A</span>
      </footer>
    </div>
  );
}

function WelcomePanel({ bleAvailable }: { bleAvailable: boolean }) {
  return (
    <div className="stack" style={{ maxWidth: 780, margin: '40px auto' }}>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Démarrer une session de diagnostic</span>
        </div>
        <div className="card-body stack">
          <p style={{ margin: 0, lineHeight: 1.7, color: 'var(--text-dim)' }}>
            OBD Scope lit les paramètres temps réel et les codes défauts de votre véhicule via un
            adaptateur ELM327. L’outil est <strong>strictement en lecture</strong> : aucune commande
            capable de modifier un calculateur ne peut être émise.
          </p>

          <div className="grid-2">
            <div className="card" style={{ background: 'var(--surface-2)' }}>
              <div className="card-body">
                <div className="row" style={{ marginBottom: 8 }}>
                  <span className="badge badge-accent">Banc virtuel</span>
                </div>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--text-dim)' }}>
                  Véhicule simulé répondant au protocole ELM327 réel. Idéal pour découvrir
                  l’interface sans matériel.
                </p>
              </div>
            </div>

            <div className="card" style={{ background: 'var(--surface-2)' }}>
              <div className="card-body">
                <div className="row" style={{ marginBottom: 8 }}>
                  <span className={`badge ${bleAvailable ? 'badge-ok' : 'badge-neutral'}`}>
                    Bluetooth LE
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--text-dim)' }}>
                  {bleAvailable
                    ? 'Connexion directe au dongle depuis le navigateur. Basculez votre adaptateur en mode BLE.'
                    : 'Non disponible dans ce navigateur. Utilisez Chrome ou Edge (desktop / Android).'}
                </p>
              </div>
            </div>
          </div>

          <div className="alert alert-warn">
            <span>
              <strong>Bluetooth classique (SPP)</strong> — les navigateurs ne l’exposent pas.
              Lancez la passerelle locale avec <code>npm run bridge</code>, puis choisissez
              « Bridge série ».
            </span>
          </div>

          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.6 }}>
            Sélectionnez une interface en haut à droite puis cliquez sur <strong>Connecter</strong>.
            Sur véhicule réel, mettez le contact sans démarrer le moteur pour une première prise de
            contact.
          </p>
        </div>
      </div>
    </div>
  );
}
