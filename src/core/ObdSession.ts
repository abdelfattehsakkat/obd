import {
  bytesToAscii,
  ElmResponseError,
  parseResponse,
  parseServiceResponse,
} from '../obd/elmParser';
import { decodeDtcPayload } from '../obd/dtc';
import {
  decodeMonitorStatus,
  decodeSupportedPids,
  PID_BY_KEY,
  PID_BY_NUMBER,
} from '../obd/pids';
import type {
  ConnectionState,
  Dtc,
  LogDirection,
  MonitorStatus,
  SensorKey,
  SensorSample,
  VehicleInfo,
} from '../obd/types';
import type { Transport } from '../transport/Transport';
import { Elm327Client } from './Elm327Client';

export interface SessionCallbacks {
  onState: (state: ConnectionState, detail?: string) => void;
  onLog: (direction: LogDirection, text: string) => void;
  onSample: (sample: SensorSample) => void;
  onVehicleInfo: (info: VehicleInfo) => void;
  onSupportedPids: (keys: SensorKey[]) => void;
  onMonitorStatus: (status: MonitorStatus) => void;
  onError: (message: string) => void;
}

const INIT_SEQUENCE: Array<{ cmd: string; timeoutMs?: number; label: string }> = [
  { cmd: 'ATZ', timeoutMs: 6000, label: "Réinitialisation de l'adaptateur" },
  { cmd: 'ATE0', label: 'Désactivation de l’écho' },
  { cmd: 'ATL0', label: 'Désactivation des sauts de ligne' },
  { cmd: 'ATS0', label: 'Suppression des espaces' },
  { cmd: 'ATH0', label: 'Masquage des en-têtes CAN' },
  { cmd: 'ATAT1', label: 'Temporisation adaptative' },
  { cmd: 'ATSP0', timeoutMs: 6000, label: 'Détection automatique du protocole' },
];

/**
 * Session de diagnostic complète : initialisation de l'adaptateur, découverte
 * des capteurs disponibles, boucle d'acquisition et lecture des codes défauts.
 *
 * IMPORTANT : toutes les requêtes émises ici passent par `Elm327Client`, qui
 * applique le garde-fou lecture seule. Aucune commande d'écriture n'existe
 * dans ce fichier — l'effacement de codes (mode 04) n'est volontairement pas
 * implémenté.
 */
export class ObdSession {
  private readonly client: Elm327Client;
  private polling = false;
  private pollAbort = false;
  private unsupported = new Set<SensorKey>();
  private unsubscribeDisconnect: (() => void) | null = null;

  constructor(
    readonly transport: Transport,
    private readonly callbacks: SessionCallbacks,
  ) {
    this.client = new Elm327Client(transport, {
      onLog: (direction, text) => this.callbacks.onLog(direction, text),
    });
  }

  async start(): Promise<void> {
    this.callbacks.onState('connecting');
    await this.transport.connect();
    this.client.attach();

    this.unsubscribeDisconnect = this.transport.onDisconnect((reason) => {
      this.pollAbort = true;
      this.polling = false;
      this.callbacks.onLog('error', reason);
      this.callbacks.onState('disconnected', reason);
    });

    this.callbacks.onState('initializing');
    await this.runInitSequence();

    const info = await this.readVehicleInfo();
    this.callbacks.onVehicleInfo(info);

    const supported = await this.discoverSupportedPids();
    this.callbacks.onSupportedPids(supported);

    this.callbacks.onState('ready');
  }

  async stop(): Promise<void> {
    this.stopPolling();
    this.unsubscribeDisconnect?.();
    this.unsubscribeDisconnect = null;
    this.client.detach();
    await this.transport.disconnect();
    this.callbacks.onState('disconnected');
  }

  private async runInitSequence(): Promise<void> {
    for (const step of INIT_SEQUENCE) {
      try {
        await this.client.send(step.cmd, step.timeoutMs);
        this.callbacks.onLog('info', `${step.label} — OK`);
      } catch (error) {
        this.callbacks.onLog(
          'warn',
          `${step.label} — ignoré (${(error as Error).message})`,
        );
      }
    }

    // Requête de contact : confirme que le calculateur répond.
    try {
      await this.client.send('0100', 6000);
      this.callbacks.onLog('info', 'Liaison avec le calculateur établie.');
    } catch (error) {
      throw new Error(
        `Le calculateur ne répond pas (${(error as Error).message}). Vérifiez que le contact est mis.`,
      );
    }
  }

  private async readVehicleInfo(): Promise<VehicleInfo> {
    const info: VehicleInfo = {};

    info.adapterVersion = await this.readText('ATI');
    info.protocol = await this.readText('ATDP');

    const voltageText = await this.readText('ATRV');
    if (voltageText) {
      const parsed = Number.parseFloat(voltageText.replace(/[^0-9.]/g, ''));
      if (Number.isFinite(parsed)) info.batteryVoltage = parsed;
    }

    info.vin = await this.readMode09Ascii(0x02);
    info.calibrationId = await this.readMode09Ascii(0x04);
    info.ecuName = await this.readMode09Ascii(0x0a);

    return info;
  }

  private async readText(command: string): Promise<string | undefined> {
    try {
      const raw = await this.client.send(command);
      const text = raw
        .split(/[\r\n]+/)
        .map((l) => l.replace(/>/g, '').trim())
        .filter(Boolean)
        .filter((l) => l.toUpperCase() !== command.toUpperCase())
        .join(' ');
      return text || undefined;
    } catch {
      return undefined;
    }
  }

  private async readMode09Ascii(pid: number): Promise<string | undefined> {
    try {
      const raw = await this.client.send(`09${pid.toString(16).toUpperCase().padStart(2, '0')}`, 6000);
      const data = parseServiceResponse(raw, 0x09, pid);
      // Le premier octet indique le nombre de messages ; on le retire s'il est
      // présent (valeur faible suivie d'une charge utile ASCII).
      const payload = data.length > 1 && data[0] <= 0x04 ? data.slice(1) : data;
      const text = bytesToAscii(payload);
      return text.length >= 3 ? text : undefined;
    } catch {
      return undefined;
    }
  }

  private async discoverSupportedPids(): Promise<SensorKey[]> {
    const found = new Set<number>();
    for (const base of [0x00, 0x20, 0x40]) {
      try {
        const raw = await this.client.send(
          `01${base.toString(16).toUpperCase().padStart(2, '0')}`,
        );
        const data = parseServiceResponse(raw, 0x01, base);
        for (const pid of decodeSupportedPids(base, data)) found.add(pid);
      } catch {
        break;
      }
    }

    const keys = [...PID_BY_NUMBER.entries()]
      .filter(([pid]) => found.has(pid))
      .map(([, definition]) => definition.key);

    this.callbacks.onLog(
      'info',
      `${found.size} PID annoncés par le calculateur, ${keys.length} exploitables par l'outil.`,
    );

    return keys;
  }

  /** Lecture ponctuelle d'un capteur. Retourne `null` si non supporté. */
  async readSensor(key: SensorKey): Promise<SensorSample | null> {
    const definition = PID_BY_KEY.get(key);
    if (!definition) return null;

    const command = `01${definition.pid.toString(16).toUpperCase().padStart(2, '0')}`;
    const raw = await this.client.send(command);
    const data = parseServiceResponse(raw, 0x01, definition.pid);

    if (data.length < definition.bytes) {
      throw new ElmResponseError(
        'BAD_FORMAT',
        `Réponse trop courte pour ${definition.label} (${data.length} octet(s) reçu(s), ${definition.bytes} attendu(s)).`,
        raw,
      );
    }

    const slice = data.slice(0, definition.bytes);
    return {
      key,
      value: definition.decode(slice),
      text: definition.decodeText?.(slice),
      at: Date.now(),
    };
  }

  /** Lecture du témoin moteur et du nombre de codes défauts (PID 01:01). */
  async readMonitorStatus(): Promise<MonitorStatus | null> {
    try {
      const raw = await this.client.send('0101');
      const data = parseServiceResponse(raw, 0x01, 0x01);
      const status = decodeMonitorStatus(data);
      this.callbacks.onMonitorStatus(status);
      return status;
    } catch {
      return null;
    }
  }

  /** Lecture des codes défauts confirmés, en attente et permanents. */
  async readDtcs(): Promise<Dtc[]> {
    const results: Dtc[] = [];
    const requests: Array<{ cmd: string; mode: number; kind: 'stored' | 'pending' | 'permanent' }> = [
      { cmd: '03', mode: 0x03, kind: 'stored' },
      { cmd: '07', mode: 0x07, kind: 'pending' },
      { cmd: '0A', mode: 0x0a, kind: 'permanent' },
    ];

    for (const request of requests) {
      try {
        const raw = await this.client.send(request.cmd, 6000);
        let data = parseServiceResponse(raw, request.mode);
        // Sur CAN, le premier octet indique le nombre de codes : la charge
        // utile est alors de longueur impaire.
        if (data.length % 2 === 1) data = data.slice(1);
        results.push(...decodeDtcPayload(data, request.kind));
      } catch (error) {
        if (error instanceof ElmResponseError && error.kind === 'NO_DATA') {
          this.callbacks.onLog('info', `Aucun code défaut (${request.kind}).`);
        } else {
          this.callbacks.onLog(
            'warn',
            `Lecture ${request.kind} impossible : ${(error as Error).message}`,
          );
        }
      }
    }

    await this.readMonitorStatus();
    return results;
  }

  get isPolling(): boolean {
    return this.polling;
  }

  /**
   * Boucle d'acquisition : interroge les capteurs en rotation.
   * Un capteur qui répond `NO DATA` est retiré de la rotation.
   */
  startPolling(keys: SensorKey[], gapMs = 40): void {
    if (this.polling) return;
    this.polling = true;
    this.pollAbort = false;
    void this.pollLoop(keys, gapMs);
  }

  stopPolling(): void {
    this.pollAbort = true;
    this.polling = false;
  }

  updatePolledKeys(keys: SensorKey[]): void {
    this.polledKeys = keys;
  }

  private polledKeys: SensorKey[] = [];

  private async pollLoop(keys: SensorKey[], gapMs: number): Promise<void> {
    this.polledKeys = keys;
    let index = 0;

    while (!this.pollAbort) {
      const active = this.polledKeys.filter((k) => !this.unsupported.has(k));
      if (active.length === 0) {
        await delay(300);
        continue;
      }

      const key = active[index % active.length];
      index += 1;

      try {
        const sample = await this.readSensor(key);
        if (sample) this.callbacks.onSample(sample);
      } catch (error) {
        if (error instanceof ElmResponseError && error.kind === 'NO_DATA') {
          this.unsupported.add(key);
          this.callbacks.onLog(
            'warn',
            `${PID_BY_KEY.get(key)?.label ?? key} non supporté par ce véhicule — retiré de l'acquisition.`,
          );
        } else if (!this.pollAbort) {
          this.callbacks.onLog('warn', (error as Error).message);
          await delay(250);
        }
      }

      if (gapMs > 0) await delay(gapMs);
    }
  }

  /** Console experte : la commande passe par le garde-fou avant émission. */
  async sendManual(command: string): Promise<string> {
    const raw = await this.client.send(command, 6000);
    try {
      const parsed = parseResponse(raw);
      return parsed.lines.join('\n');
    } catch (error) {
      return (error as Error).message;
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
