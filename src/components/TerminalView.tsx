import { useEffect, useMemo, useRef, useState } from 'react';
import { checkCommand } from '../obd/readOnlyGuard';
import type { ObdController } from '../core/useObd';
import type { LogDirection } from '../obd/types';

const ARROWS: Record<LogDirection, string> = {
  tx: '»',
  rx: '«',
  info: 'ℹ',
  warn: '⚠',
  error: '✕',
};

function formatTime(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(
    d.getSeconds(),
  ).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

export function TerminalView({ controller }: { controller: ObdController }) {
  const { logs, clearLogs, sendManual, state } = controller;
  const [command, setCommand] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const terminalRef = useRef<HTMLDivElement>(null);

  const verdict = useMemo(() => (command.trim() ? checkCommand(command) : null), [command]);

  useEffect(() => {
    // On fait défiler le conteneur du terminal, pas la page : `scrollIntoView`
    // n'est pas garanti dans tous les environnements de rendu.
    const container = terminalRef.current;
    if (autoScroll && container) container.scrollTop = container.scrollHeight;
  }, [logs, autoScroll]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!command.trim() || state !== 'ready') return;
    const toSend = command;
    setCommand('');
    try {
      await sendManual(toSend);
    } catch {
      /* le garde-fou et la session journalisent déjà l'échec */
    }
  };

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)' }}>
      <div className="card-header">
        <span className="card-title">Console adaptateur</span>
        <div className="topbar-spacer" />
        <label className="row" style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          <input
            type="checkbox"
            className="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
          />
          Défilement auto
        </label>
        <button className="btn btn-sm" onClick={clearLogs}>
          Effacer
        </button>
      </div>

      <div className="terminal" style={{ flex: 1 }} ref={terminalRef}>
        {logs.length === 0 && <div className="muted">Aucun échange enregistré.</div>}
        {logs.map((entry) => (
          <div className={`term-line term-${entry.direction}`} key={entry.id}>
            <span className="term-time">{formatTime(entry.at)}</span>
            <span className="term-arrow">{ARROWS[entry.direction]}</span>
            <span className="term-text">{entry.text}</span>
          </div>
        ))}
      </div>

      <form
        onSubmit={submit}
        style={{
          display: 'flex',
          gap: 10,
          padding: 12,
          borderTop: '1px solid var(--border)',
          alignItems: 'center',
        }}
      >
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value.toUpperCase())}
          placeholder="Commande experte — ex. 010C, 0902, ATDP"
          style={{ flex: 1, fontFamily: 'var(--mono)' }}
          spellCheck={false}
          autoComplete="off"
        />
        {verdict && (
          <span className={`badge ${verdict.allowed ? 'badge-ok' : 'badge-danger'}`}>
            {verdict.allowed ? 'Lecture' : 'Bloqué'}
          </span>
        )}
        <button
          className="btn btn-primary"
          type="submit"
          disabled={state !== 'ready' || !verdict?.allowed}
        >
          Envoyer
        </button>
      </form>

      {verdict && !verdict.allowed && (
        <div style={{ padding: '0 12px 12px' }}>
          <div className="alert alert-error">
            <span>
              <strong>Commande refusée</strong> — {verdict.reason}. Seules les requêtes de lecture
              (modes 01, 02, 03, 06, 07, 09, 0A) et une liste blanche de commandes AT sont
              autorisées.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
