export type TransportKind = 'ble' | 'bridge' | 'demo';

export interface TransportInfo {
  kind: TransportKind;
  label: string;
  /** Nom du périphérique effectivement connecté. */
  deviceName?: string;
  /** Détail affiché dans l'UI (UUID de service, URL du bridge...). */
  detail?: string;
}

/**
 * Contrat commun à tous les canaux de communication avec l'ELM327.
 * Le transport est volontairement « bête » : il transporte des octets ASCII.
 * Le contrôle lecture seule est appliqué au-dessus, dans `Elm327Client`.
 */
export interface Transport {
  readonly info: TransportInfo;
  readonly connected: boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** Écrit une commande brute (le CR final est ajouté par le transport). */
  write(command: string): Promise<void>;
  /** Enregistre le consommateur des données entrantes. Retourne un désabonnement. */
  onData(listener: (chunk: string) => void): () => void;
  /** Notifié en cas de déconnexion inopinée. */
  onDisconnect(listener: (reason: string) => void): () => void;
}

/** Petit utilitaire d'émission d'évènements typés, partagé par les transports. */
export class Emitter<T> {
  private listeners = new Set<(value: T) => void>();

  subscribe(listener: (value: T) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(value: T): void {
    for (const listener of [...this.listeners]) listener(value);
  }

  clear(): void {
    this.listeners.clear();
  }
}
