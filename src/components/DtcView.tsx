import type { ObdController } from '../core/useObd';
import type { Dtc, DtcKind, ReadinessState } from '../obd/types';

const READINESS_META: Record<ReadinessState, { label: string; badge: string }> = {
  ready: { label: 'Prêt', badge: 'badge-ok' },
  incomplete: { label: 'Non prêt', badge: 'badge-warn' },
  unsupported: { label: 'Non supporté', badge: 'badge-neutral' },
};

const KIND_META: Record<DtcKind, { label: string; badge: string; hint: string }> = {
  stored: {
    label: 'Confirmé',
    badge: 'badge-danger',
    hint: 'Défaut confirmé sur plusieurs cycles de conduite — allume le témoin moteur.',
  },
  pending: {
    label: 'En attente',
    badge: 'badge-warn',
    hint: 'Détecté sur un seul cycle : à surveiller, pas encore confirmé.',
  },
  permanent: {
    label: 'Permanent',
    badge: 'badge-accent',
    hint: 'Ne peut être effacé qu’après validation des moniteurs embarqués par le calculateur.',
  },
};

function DtcGroup({ kind, codes }: { kind: DtcKind; codes: Dtc[] }) {
  const meta = KIND_META[kind];
  return (
    <div className="card">
      <div className="card-header">
        <span className={`badge ${meta.badge}`}>{meta.label}</span>
        <span className="card-title">
          {codes.length} code{codes.length > 1 ? 's' : ''}
        </span>
        <div className="topbar-spacer" />
        <span className="muted" style={{ fontSize: 11 }}>
          {meta.hint}
        </span>
      </div>
      {codes.length === 0 ? (
        <div className="empty" style={{ padding: '26px 20px' }}>
          <p>Aucun code dans cette catégorie.</p>
        </div>
      ) : (
        <div>
          {codes.map((dtc) => (
            <div className="dtc-item" key={`${dtc.kind}-${dtc.code}`}>
              <div
                className="dtc-code"
                style={{ color: kind === 'pending' ? 'var(--warn)' : 'var(--danger)' }}
              >
                {dtc.code}
              </div>
              <div>
                <div className="dtc-desc">{dtc.description}</div>
                <div className="dtc-meta">
                  {dtc.generic ? 'Code générique SAE' : 'Code spécifique constructeur'} ·{' '}
                  {
                    { P: 'Groupe motopropulseur', C: 'Châssis', B: 'Carrosserie', U: 'Réseau' }[
                      dtc.system
                    ]
                  }
                </div>
              </div>
              <span className="badge badge-neutral">{dtc.system}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DtcView({ controller }: { controller: ObdController }) {
  const { dtcs, scanDtcs, isScanningDtc, monitorStatus, state } = controller;
  const ready = state === 'ready';

  return (
    <div className="stack">
      <div className="card">
        <div className="card-header">
          <span className="card-title">Analyse des codes défauts</span>
          <div className="topbar-spacer" />
          {monitorStatus && (
            <span className={`badge ${monitorStatus.milOn ? 'badge-danger' : 'badge-ok'}`}>
              <span className="dot" />
              Témoin moteur {monitorStatus.milOn ? 'allumé' : 'éteint'}
            </span>
          )}
          <button className="btn btn-primary btn-sm" onClick={scanDtcs} disabled={!ready || isScanningDtc}>
            {isScanningDtc ? 'Analyse en cours…' : 'Lancer l’analyse'}
          </button>
        </div>
        <div className="card-body">
          <div className="alert alert-info">
            <span>
              Cet outil <strong>ne peut pas effacer</strong> les codes défauts : le mode OBD 04
              est bloqué par le garde-fou lecture seule. Effacer un code sans avoir réparé la
              panne fait perdre les données figées (freeze frame) qui servent au diagnostic.
            </span>
          </div>
        </div>
      </div>

      <section className="card" aria-labelledby="readiness-title">
        <div className="card-header">
          <h2 className="card-title" id="readiness-title" style={{ margin: 0 }}>
            Moniteurs antipollution
          </h2>
        </div>
        <div className="card-body">
          {monitorStatus?.readiness ? (
            <dl className="kv" style={{ gridTemplateColumns: 'minmax(0, 190px) max-content' }}>
              {monitorStatus.readiness.map(({ label, state }) => (
                <div key={label} style={{ display: 'contents' }}>
                  <dt>{label}</dt>
                  <dd><span className={`badge ${READINESS_META[state].badge}`}>{READINESS_META[state].label}</span></dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="muted" style={{ margin: 0 }}>État non disponible.</p>
          )}
        </div>
      </section>

      {(['stored', 'pending', 'permanent'] as DtcKind[]).map((kind) => (
        <DtcGroup key={kind} kind={kind} codes={dtcs.filter((d) => d.kind === kind)} />
      ))}
    </div>
  );
}
