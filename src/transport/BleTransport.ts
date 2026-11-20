import { Emitter, type Transport, type TransportInfo } from './Transport';

/**
 * Profils GATT connus des adaptateurs ELM327 BLE.
 *
 * Le protocole OBD-II est normalisé, mais PAS le tunnel BLE des dongles :
 * chaque fabricant expose son propre service « série sur BLE ». On tente donc
 * les profils connus, puis on bascule sur une détection automatique.
 */
export interface BleProfile {
  name: string;
  service: string;
  /** Caractéristique d'écriture (commandes vers l'adaptateur). */
  write: string;
  /** Caractéristique de notification (réponses de l'adaptateur). */
  notify: string;
}

export const KNOWN_BLE_PROFILES: BleProfile[] = [
  {
    name: 'FFF0 (Vgate / clones ELM327 BLE)',
    service: '0000fff0-0000-1000-8000-00805f9b34fb',
    write: '0000fff2-0000-1000-8000-00805f9b34fb',
    notify: '0000fff1-0000-1000-8000-00805f9b34fb',
  },
  {
    name: 'FFE0 (module HM-10 / CC254x)',
    service: '0000ffe0-0000-1000-8000-00805f9b34fb',
    write: '0000ffe1-0000-1000-8000-00805f9b34fb',
    notify: '0000ffe1-0000-1000-8000-00805f9b34fb',
  },
  {
    name: '18F0 (LELink / Konnwei)',
    service: '000018f0-0000-1000-8000-00805f9b34fb',
    write: '00002af1-0000-1000-8000-00805f9b34fb',
    notify: '00002af0-0000-1000-8000-00805f9b34fb',
  },
  {
    name: 'Nordic UART Service',
    service: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    write: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
    notify: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
  },
  {
    name: 'FFE0 / FFE2 (variante à deux caractéristiques)',
    service: '0000ffe0-0000-1000-8000-00805f9b34fb',
    write: '0000ffe2-0000-1000-8000-00805f9b34fb',
    notify: '0000ffe1-0000-1000-8000-00805f9b34fb',
  },
  {
    name: 'FFE5 / FFE0 (JDY-08, CH9141)',
    service: '0000ffe5-0000-1000-8000-00805f9b34fb',
    write: '0000ffe9-0000-1000-8000-00805f9b34fb',
    notify: '0000ffe4-0000-1000-8000-00805f9b34fb',
  },
  {
    name: 'FFF0 inversé (FFF1 écriture / FFF2 notification)',
    service: '0000fff0-0000-1000-8000-00805f9b34fb',
    write: '0000fff1-0000-1000-8000-00805f9b34fb',
    notify: '0000fff2-0000-1000-8000-00805f9b34fb',
  },
];

/** Génère les UUID 128 bits des identifiants 16 bits `from`..`to` inclus. */
function uuidRange(from: number, to: number): string[] {
  const list: string[] = [];
  for (let id = from; id <= to; id++) {
    list.push(`0000${id.toString(16).padStart(4, '0')}-0000-1000-8000-00805f9b34fb`);
  }
  return list;
}

/**
 * Services proposés à `requestDevice` pour autoriser l'accès GATT.
 *
 * Piège Web Bluetooth : avec `acceptAllDevices`, `getPrimaryServices()` ne renvoie
 * QUE les services listés ici. La détection automatique est donc aveugle à tout
 * service absent de cette liste. On déclare par conséquent l'intégralité des plages
 * 16 bits dans lesquelles les modules « série sur BLE » se rangent en pratique
 * (FFE0-FFEF, FFF0-FFFF, 18F0-18FF), en plus des UUID 128 bits connus.
 */
export const OPTIONAL_SERVICES = Array.from(
  new Set([
    ...KNOWN_BLE_PROFILES.map((p) => p.service),
    ...uuidRange(0xffe0, 0xffef),
    ...uuidRange(0xfff0, 0xffff),
    ...uuidRange(0x18f0, 0x18ff),
    ...uuidRange(0xfd00, 0xfd0f),
  ]),
);

export function isWebBluetoothAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

/** Résumé lisible des propriétés d'une caractéristique, pour le diagnostic. */
function describeProperties(c: BluetoothRemoteGATTCharacteristic): string {
  const flags: string[] = [];
  if (c.properties.read) flags.push('R');
  if (c.properties.write) flags.push('W');
  if (c.properties.writeWithoutResponse) flags.push('w');
  if (c.properties.notify) flags.push('N');
  if (c.properties.indicate) flags.push('I');
  return flags.join('') || '-';
}

export class BleTransport implements Transport {
  info: TransportInfo = { kind: 'ble', label: 'Bluetooth LE' };

  private device: BluetoothDevice | null = null;
  private writeChar: BluetoothRemoteGATTCharacteristic | null = null;
  private notifyChar: BluetoothRemoteGATTCharacteristic | null = null;
  private readonly decoder = new TextDecoder();
  private readonly encoder = new TextEncoder();
  private readonly dataEmitter = new Emitter<string>();
  private readonly disconnectEmitter = new Emitter<string>();
  private readonly onGattDisconnected = () => {
    this.writeChar = null;
    this.notifyChar = null;
    this.disconnectEmitter.emit('Périphérique BLE déconnecté.');
  };

  get connected(): boolean {
    return Boolean(this.device?.gatt?.connected && this.writeChar && this.notifyChar);
  }

  async connect(): Promise<void> {
    if (!isWebBluetoothAvailable()) {
      throw new Error(
        "Web Bluetooth n'est pas disponible. Utilisez Chrome ou Edge (desktop / Android) en HTTPS ou sur localhost.",
      );
    }

    this.device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: OPTIONAL_SERVICES,
    });

    this.device.addEventListener('gattserverdisconnected', this.onGattDisconnected);

    const server = await this.device.gatt?.connect();
    if (!server) throw new Error('Connexion GATT impossible.');

    const resolved = await this.resolveProfile(server);
    this.writeChar = resolved.write;
    this.notifyChar = resolved.notify;

    await this.notifyChar.startNotifications();
    this.notifyChar.addEventListener('characteristicvaluechanged', (event) => {
      const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
      if (value) this.dataEmitter.emit(this.decoder.decode(value));
    });

    this.info = {
      kind: 'ble',
      label: 'Bluetooth LE',
      deviceName: this.device.name || 'Périphérique sans nom',
      detail: resolved.profileName,
    };
  }

  private async resolveProfile(server: BluetoothRemoteGATTServer): Promise<{
    write: BluetoothRemoteGATTCharacteristic;
    notify: BluetoothRemoteGATTCharacteristic;
    profileName: string;
  }> {
    for (const profile of KNOWN_BLE_PROFILES) {
      try {
        const service = await server.getPrimaryService(profile.service);
        const write = await service.getCharacteristic(profile.write);
        const notify = await service.getCharacteristic(profile.notify);
        if (!notify.properties.notify && !notify.properties.indicate) continue;
        if (!write.properties.write && !write.properties.writeWithoutResponse) continue;
        return { write, notify, profileName: profile.name };
      } catch {
        // Profil absent : on essaie le suivant.
      }
    }

    // Détection automatique : on parcourt tous les services accessibles.
    // Les services normalisés ne transportent jamais de flux série : on les écarte
    // pour éviter de retenir une caractéristique sans rapport.
    const GENERIC_SERVICES = new Set([
      '00001800-0000-1000-8000-00805f9b34fb', // Generic Access
      '00001801-0000-1000-8000-00805f9b34fb', // Generic Attribute
      '0000180a-0000-1000-8000-00805f9b34fb', // Device Information
      '0000180f-0000-1000-8000-00805f9b34fb', // Battery
    ]);

    const services = await server.getPrimaryServices().catch(() => []);
    const seen: string[] = [];

    for (const service of services) {
      if (GENERIC_SERVICES.has(service.uuid)) continue;
      const chars = await service.getCharacteristics().catch(() => []);
      const write = chars.find(
        (c) => c.properties.write || c.properties.writeWithoutResponse,
      );
      const notify = chars.find((c) => c.properties.notify || c.properties.indicate);

      seen.push(
        `${service.uuid} → ${chars
          .map((c) => `${c.uuid.slice(4, 8)}[${describeProperties(c)}]`)
          .join(' ')}`,
      );

      if (write && notify) {
        return {
          write,
          notify,
          profileName: `Détection auto — service ${service.uuid}`,
        };
      }
    }

    throw new Error(
      [
        "Aucun service série BLE compatible trouvé sur ce périphérique.",
        seen.length
          ? `Services explorés :\n${seen.join('\n')}`
          : "Aucun service exploitable n'a été exposé. L'UUID du dongle est probablement hors des plages autorisées : relevez-le via chrome://bluetooth-internals puis ajoutez-le à OPTIONAL_SERVICES dans src/transport/BleTransport.ts.",
      ].join('\n'),
    );
  }

  async disconnect(): Promise<void> {
    this.device?.removeEventListener('gattserverdisconnected', this.onGattDisconnected);
    try {
      await this.notifyChar?.stopNotifications();
    } catch {
      /* le périphérique peut déjà être parti */
    }
    this.device?.gatt?.disconnect();
    this.device = null;
    this.writeChar = null;
    this.notifyChar = null;
  }

  async write(command: string): Promise<void> {
    if (!this.writeChar) throw new Error('Transport BLE non connecté.');
    const payload = this.encoder.encode(`${command}\r`);
    // Les dongles BLE acceptent rarement plus de 20 octets par trame.
    const chunkSize = 20;
    for (let i = 0; i < payload.length; i += chunkSize) {
      const chunk = payload.slice(i, i + chunkSize);
      if (this.writeChar.properties.writeWithoutResponse) {
        await this.writeChar.writeValueWithoutResponse(chunk);
      } else {
        await this.writeChar.writeValue(chunk);
      }
    }
  }

  onData(listener: (chunk: string) => void): () => void {
    return this.dataEmitter.subscribe(listener);
  }

  onDisconnect(listener: (reason: string) => void): () => void {
    return this.disconnectEmitter.subscribe(listener);
  }
}
