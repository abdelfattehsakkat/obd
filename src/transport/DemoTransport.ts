import { Emitter, type Transport, type TransportInfo } from './Transport';

/**
 * Simulateur d'adaptateur ELM327 + véhicule.
 *
 * Il implémente le MÊME dialogue ASCII qu'un vrai dongle : l'intégralité de la
 * chaîne (garde-fou, file de commandes, analyseur de trames, décodeurs) est
 * donc réellement exercée en mode démo. C'est le mode utilisé pour les tests
 * automatisés et pour développer sans véhicule.
 */

const VIN = 'VF1RFA00567123456';
const CALIBRATION_ID = 'SW-EDC17C42-0091';
const ECU_NAME = 'ECM-EngineControl';

/** PID du mode 01 simulés par le banc virtuel. */
const SUPPORTED_PIDS = [
  0x01, 0x03, 0x04, 0x05, 0x06, 0x07, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10,
  0x11, 0x1f, 0x21, 0x2f, 0x31, 0x33, 0x42, 0x43, 0x44, 0x45, 0x46, 0x5c, 0x5e,
];

/** Codes défauts injectés dans le véhicule virtuel. */
const STORED_DTCS = [0x03, 0x01, 0x04, 0x20];
const PENDING_DTCS = [0x01, 0x71];
const PERMANENT_DTCS = [0x04, 0x20];

const hex = (n: number, width = 2) =>
  Math.max(0, Math.round(n)).toString(16).toUpperCase().padStart(width, '0');

/** Construit le bitmask « PID supportés » pour une base donnée (0x00, 0x20...). */
function supportedMask(base: number): string {
  const bytes = [0, 0, 0, 0];
  for (const pid of SUPPORTED_PIDS) {
    const offset = pid - base - 1;
    if (offset < 0 || offset > 31) continue;
    bytes[Math.floor(offset / 8)] |= 0x80 >> offset % 8;
  }
  // Le bit de poids faible indique la disponibilité du bloc suivant.
  if (SUPPORTED_PIDS.some((p) => p > base + 32)) bytes[3] |= 0x01;
  return bytes.map((b) => hex(b)).join('');
}

interface VehicleState {
  rpm: number;
  speed: number;
  coolant: number;
  intakeTemp: number;
  oilTemp: number;
  throttle: number;
  load: number;
  maf: number;
  map: number;
  fuelLevel: number;
  voltage: number;
  runtime: number;
  fuelRate: number;
  shortTrim: number;
  longTrim: number;
  timing: number;
}

/** Modèle physique simplifié : cycle de conduite urbain répétitif. */
function simulate(elapsedSeconds: number): VehicleState {
  const t = elapsedSeconds;
  const cycle = t % 120;

  let speed: number;
  if (cycle < 12) speed = 0;
  else if (cycle < 35) speed = ((cycle - 12) / 23) * 55;
  else if (cycle < 60) speed = 55 + Math.sin((cycle - 35) / 4) * 6;
  else if (cycle < 80) speed = 55 + ((cycle - 60) / 20) * 55;
  else if (cycle < 100) speed = 110 + Math.sin((cycle - 80) / 3) * 4;
  else speed = Math.max(0, 110 * (1 - (cycle - 100) / 20));

  speed = Math.max(0, speed);

  const gear = speed < 1 ? 0 : Math.min(5, Math.max(1, Math.ceil(speed / 25)));
  const idle = 780 + Math.sin(t * 2.3) * 25;
  const rpm = gear === 0 ? idle : Math.min(4600, 950 + (speed / gear) * 42 + Math.sin(t * 1.7) * 60);

  const accel = cycle < 35 || (cycle >= 60 && cycle < 80);
  const throttle = gear === 0 ? 13 + Math.sin(t * 1.1) * 2 : Math.min(92, 18 + speed * 0.42 + (accel ? 22 : 0));
  const load = Math.min(98, throttle * 0.85 + (rpm / 4600) * 18);

  const warmup = Math.min(1, t / 210);
  const coolant = 22 + warmup * 67 + Math.sin(t / 18) * 1.6;
  const oilTemp = 21 + warmup * 72 + Math.sin(t / 25) * 1.2;

  const maf = Math.max(1.2, (rpm / 1000) * (load / 100) * 11 + 1.8);
  const map = Math.min(240, 32 + load * 1.7);

  return {
    rpm,
    speed,
    coolant,
    intakeTemp: 19 + warmup * 14 + Math.sin(t / 9) * 1.1,
    oilTemp,
    throttle,
    load,
    maf,
    map,
    fuelLevel: Math.max(6, 74 - t / 240),
    voltage: 14.15 + Math.sin(t * 0.8) * 0.12,
    runtime: Math.floor(t),
    fuelRate: Math.max(0.6, (maf / 14.7) * 3.6 / 0.745),
    shortTrim: Math.sin(t / 6) * 3.4 + 1.2,
    longTrim: 4.7 + Math.sin(t / 45) * 0.8,
    timing: gear === 0 ? 8 + Math.sin(t) * 2 : Math.min(38, 12 + (rpm / 4600) * 24),
  };
}

export class DemoTransport implements Transport {
  readonly info: TransportInfo = {
    kind: 'demo',
    label: 'Banc virtuel',
    deviceName: 'ELM327 v1.5 (simulé)',
    detail: 'Véhicule de démonstration — aucune liaison matérielle',
  };

  private readonly dataEmitter = new Emitter<string>();
  private readonly disconnectEmitter = new Emitter<string>();
  private open = false;
  private echo = true;
  private headers = false;
  private spaces = true;
  private startedAt = 0;
  private timers = new Set<ReturnType<typeof setTimeout>>();

  /** Latence simulée en millisecondes (aller-retour adaptateur). */
  constructor(private readonly latencyMs = 26) {}

  get connected(): boolean {
    return this.open;
  }

  async connect(): Promise<void> {
    this.open = true;
    this.echo = true;
    this.headers = false;
    this.spaces = true;
    this.startedAt = Date.now();
  }

  async disconnect(): Promise<void> {
    this.open = false;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }

  onData(listener: (chunk: string) => void): () => void {
    return this.dataEmitter.subscribe(listener);
  }

  onDisconnect(listener: (reason: string) => void): () => void {
    return this.disconnectEmitter.subscribe(listener);
  }

  async write(command: string): Promise<void> {
    if (!this.open) throw new Error('Banc virtuel non démarré.');
    const normalized = command.replace(/[\s\r\n]/g, '').toUpperCase();
    const body = this.respond(normalized);
    const prefix = this.echo ? `${normalized}\r` : '';
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (!this.open) return;
      this.dataEmitter.emit(`${prefix}${body}\r\r>`);
    }, this.latencyMs);
    this.timers.add(timer);
  }

  private get elapsed(): number {
    return (Date.now() - this.startedAt) / 1000;
  }

  /** Applique le formatage ELM327 (espaces entre octets si ATS1). */
  private format(payload: string): string {
    if (!this.spaces) return payload;
    return (payload.match(/.{1,2}/g) ?? []).join(' ');
  }

  private line(payload: string): string {
    return this.headers ? `7E8 ${this.format(payload)}` : this.format(payload);
  }

  private respond(cmd: string): string {
    if (cmd.startsWith('AT')) return this.respondAt(cmd);

    const mode = cmd.slice(0, 2);
    switch (mode) {
      case '01':
        return this.respondMode01(cmd);
      case '03':
        return this.line(`43${hex(STORED_DTCS.length / 2)}${STORED_DTCS.map((b) => hex(b)).join('')}`);
      case '07':
        return this.line(`47${hex(PENDING_DTCS.length / 2)}${PENDING_DTCS.map((b) => hex(b)).join('')}`);
      case '0A':
        return this.line(`4A${hex(PERMANENT_DTCS.length / 2)}${PERMANENT_DTCS.map((b) => hex(b)).join('')}`);
      case '09':
        return this.respondMode09(cmd);
      case '02':
        // Données figées : on renvoie le même jeu que le mode 01, trame 00.
        return this.respondMode01(`01${cmd.slice(2, 4)}`).replace('41', '42');
      default:
        return 'NO DATA';
    }
  }

  private respondAt(cmd: string): string {
    if (cmd === 'ATZ' || cmd === 'ATD' || cmd === 'ATWS') {
      this.echo = cmd === 'ATZ' ? true : this.echo;
      return 'ELM327 v1.5';
    }
    if (cmd === 'ATI') return 'ELM327 v1.5';
    if (cmd === 'AT@1') return 'OBD SCOPE VIRTUAL BENCH';
    if (cmd === 'ATRV') return `${(14.1 + Math.sin(this.elapsed * 0.8) * 0.12).toFixed(1)}V`;
    if (cmd === 'ATDP') return 'AUTO, ISO 15765-4 (CAN 11/500)';
    if (cmd === 'ATDPN') return 'A6';
    if (/^ATE([01])$/.test(cmd)) {
      this.echo = cmd.endsWith('1');
      return 'OK';
    }
    if (/^ATS([01])$/.test(cmd)) {
      this.spaces = cmd.endsWith('1');
      return 'OK';
    }
    if (/^ATH([01])$/.test(cmd)) {
      this.headers = cmd.endsWith('1');
      return 'OK';
    }
    if (/^AT(L[01]|AT[012]|ST[0-9A-F]{1,2}|SP[0-9A]|TP[0-9A]|CAF[01]|M[01]|AR|CRA[0-9A-F]+)$/.test(cmd)) {
      return 'OK';
    }
    return '?';
  }

  private respondMode01(cmd: string): string {
    const pid = parseInt(cmd.slice(2, 4), 16);
    if (Number.isNaN(pid)) return '?';

    if (pid === 0x00 || pid === 0x20 || pid === 0x40 || pid === 0x60) {
      const mask = supportedMask(pid);
      if (mask === '00000000') return 'NO DATA';
      return this.line(`41${hex(pid)}${mask}`);
    }

    const s = simulate(this.elapsed);
    const one = (value: number) => hex(Math.min(255, Math.max(0, value)));
    const two = (value: number) => {
      const v = Math.min(65535, Math.max(0, Math.round(value)));
      return hex(v >> 8) + hex(v & 0xff);
    };

    const payload = (() => {
      switch (pid) {
        case 0x01:
          // Témoin moteur allumé + 2 codes défauts confirmés.
          return `${hex(0x80 | (STORED_DTCS.length / 2))}07E500`;
        case 0x03:
          return '0200';
        case 0x04:
          return one((s.load * 255) / 100);
        case 0x05:
          return one(s.coolant + 40);
        case 0x06:
          return one(((s.shortTrim + 100) * 128) / 100);
        case 0x07:
          return one(((s.longTrim + 100) * 128) / 100);
        case 0x0a:
          return one(410 / 3);
        case 0x0b:
          return one(s.map);
        case 0x0c:
          return two(s.rpm * 4);
        case 0x0d:
          return one(s.speed);
        case 0x0e:
          return one((s.timing + 64) * 2);
        case 0x0f:
          return one(s.intakeTemp + 40);
        case 0x10:
          return two(s.maf * 100);
        case 0x11:
          return one((s.throttle * 255) / 100);
        case 0x1f:
          return two(s.runtime);
        case 0x21:
          return two(148);
        case 0x2f:
          return one((s.fuelLevel * 255) / 100);
        case 0x31:
          return two(1264);
        case 0x33:
          return one(101);
        case 0x42:
          return two(s.voltage * 1000);
        case 0x43:
          return two((s.load * 255) / 100);
        case 0x44:
          return two(0.998 * 32768);
        case 0x45:
          return one((s.throttle * 0.92 * 255) / 100);
        case 0x46:
          return one(18 + 40);
        case 0x5c:
          return one(s.oilTemp + 40);
        case 0x5e:
          return two(s.fuelRate * 20);
        default:
          return null;
      }
    })();

    if (payload === null) return 'NO DATA';
    return this.line(`41${hex(pid)}${payload}`);
  }

  /** Réponses mode 09 : trames longues découpées en style ISO-TP ELM327. */
  private respondMode09(cmd: string): string {
    const pid = parseInt(cmd.slice(2, 4), 16);

    if (pid === 0x00) return this.line('490055400000');

    const asciiPayload = (text: string) =>
      text
        .split('')
        .map((c) => hex(c.charCodeAt(0)))
        .join('');

    let payload: string | null = null;
    if (pid === 0x02) payload = `490201${asciiPayload(VIN)}`;
    if (pid === 0x04) payload = `490401${asciiPayload(CALIBRATION_ID)}`;
    if (pid === 0x0a) payload = `490A01${asciiPayload(ECU_NAME)}`;
    if (payload === null) return 'NO DATA';

    const totalBytes = payload.length / 2;
    // Première ligne : longueur totale ISO-TP, puis trames indexées de 7 octets.
    const chunks = payload.match(/.{1,14}/g) ?? [];
    const lines = [hex(totalBytes, 3)];
    chunks.forEach((chunk, index) => {
      lines.push(`${index.toString(16).toUpperCase()}:${this.format(chunk)}`);
    });
    return lines.join('\r');
  }
}
