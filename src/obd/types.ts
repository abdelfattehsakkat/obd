/**
 * Types partagés de la couche OBD.
 * Aucune dépendance externe : ce module est testable en Node pur.
 */

/** Identifiant canonique d'un capteur : `mode:pid` en hexa majuscule, ex. `01:0C`. */
export type SensorKey = string;

export type SensorCategory =
  | 'moteur'
  | 'admission'
  | 'carburant'
  | 'temperature'
  | 'electrique'
  | 'vehicule'
  | 'emissions';

export interface PidDefinition {
  /** Mode OBD (toujours 0x01 pour les données temps réel). */
  mode: number;
  /** Numéro de PID, ex. 0x0C pour le régime moteur. */
  pid: number;
  /** Clé canonique `01:0C`. */
  key: SensorKey;
  /** Libellé court affiché dans l'UI. */
  label: string;
  /** Description longue (tooltip / docs). */
  description: string;
  /** Unité affichée. `''` si sans unité. */
  unit: string;
  /** Nombre d'octets de données attendus dans la réponse. */
  bytes: number;
  /** Bornes utilisées pour les jauges et l'échelle des graphiques. */
  min: number;
  max: number;
  /** Nombre de décimales conseillé pour l'affichage. */
  decimals: number;
  category: SensorCategory;
  /** Décodeur : reçoit les octets de données (hors en-tête `41 XX`). */
  decode: (data: number[]) => number;
  /** Décodeur textuel optionnel (ex. statut du système carburant). */
  decodeText?: (data: number[]) => string;
}

export interface SensorSample {
  key: SensorKey;
  value: number;
  text?: string;
  /** Timestamp `performance.now()` ou `Date.now()` selon le contexte. */
  at: number;
}

export type DtcKind = 'stored' | 'pending' | 'permanent';

export interface Dtc {
  /** Code normalisé, ex. `P0301`. */
  code: string;
  /** Système : Powertrain, Chassis, Body, Network. */
  system: 'P' | 'C' | 'B' | 'U';
  /** `true` si le code est générique SAE, `false` si spécifique constructeur. */
  generic: boolean;
  kind: DtcKind;
  description: string;
}

export type ReadinessState = 'ready' | 'incomplete' | 'unsupported';

export interface ReadinessMonitor {
  label: string;
  state: ReadinessState;
}

export interface MonitorStatus {
  /** Témoin moteur (Malfunction Indicator Lamp) allumé. */
  milOn: boolean;
  /** Nombre de codes défauts confirmés remontés par l'ECU. */
  dtcCount: number;
  readiness?: ReadinessMonitor[];
}

export interface VehicleInfo {
  vin?: string;
  calibrationId?: string;
  ecuName?: string;
  protocol?: string;
  adapterVersion?: string;
  batteryVoltage?: number;
}

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'initializing'
  | 'ready'
  | 'error';

export type LogDirection = 'tx' | 'rx' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id: number;
  at: number;
  direction: LogDirection;
  text: string;
}
