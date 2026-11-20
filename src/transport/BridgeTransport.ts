import { Emitter, type Transport, type TransportInfo } from './Transport';

/**
 * Transport « bridge » : passerelle WebSocket vers un port série local.
 *
 * Nécessaire pour le Bluetooth CLASSIQUE (profil SPP/RFCOMM), que les
 * navigateurs n'exposent pas. Le bridge Node (`npm run bridge`) apparie
 * l'adaptateur en tant que port série puis relaie les octets.
 *
 * Protocole (JSON par message) :
 *   → { type: 'write', data: '010C' }
 *   ← { type: 'data', data: '410C1AF8\r>' }
 *   ← { type: 'status', state: 'open' | 'closed', detail?: string }
 *   ← { type: 'error', message: string }
 */
export class BridgeTransport implements Transport {
  info: TransportInfo;

  private socket: WebSocket | null = null;
  private readonly dataEmitter = new Emitter<string>();
  private readonly disconnectEmitter = new Emitter<string>();
  private open = false;

  constructor(private readonly url: string) {
    this.info = { kind: 'bridge', label: 'Bridge série', detail: url };
  }

  get connected(): boolean {
    return this.open && this.socket?.readyState === WebSocket.OPEN;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const socket = new WebSocket(this.url);
      this.socket = socket;

      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        reject(new Error(message));
      };

      socket.addEventListener('error', () =>
        fail(
          `Bridge injoignable sur ${this.url}. Démarrez-le avec « npm run bridge » puis réessayez.`,
        ),
      );

      socket.addEventListener('close', () => {
        this.open = false;
        fail(`Bridge injoignable sur ${this.url}.`);
        this.disconnectEmitter.emit('Connexion au bridge fermée.');
      });

      socket.addEventListener('message', (event) => {
        let message: { type?: string; data?: string; state?: string; detail?: string; message?: string };
        try {
          message = JSON.parse(String(event.data));
        } catch {
          this.dataEmitter.emit(String(event.data));
          return;
        }

        switch (message.type) {
          case 'data':
            if (message.data) this.dataEmitter.emit(message.data);
            break;
          case 'status':
            if (message.state === 'open') {
              this.open = true;
              this.info = {
                kind: 'bridge',
                label: 'Bridge série',
                deviceName: message.detail,
                detail: this.url,
              };
              if (!settled) {
                settled = true;
                resolve();
              }
            } else {
              this.open = false;
              this.disconnectEmitter.emit(message.detail ?? 'Port série fermé.');
            }
            break;
          case 'error':
            if (!settled) fail(message.message ?? 'Erreur du bridge.');
            else this.disconnectEmitter.emit(message.message ?? 'Erreur du bridge.');
            break;
        }
      });
    });
  }

  async disconnect(): Promise<void> {
    this.open = false;
    this.socket?.close();
    this.socket = null;
  }

  async write(command: string): Promise<void> {
    if (!this.connected) throw new Error('Bridge non connecté.');
    this.socket?.send(JSON.stringify({ type: 'write', data: command }));
  }

  onData(listener: (chunk: string) => void): () => void {
    return this.dataEmitter.subscribe(listener);
  }

  onDisconnect(listener: (reason: string) => void): () => void {
    return this.disconnectEmitter.subscribe(listener);
  }
}
