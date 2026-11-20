import type { PidDefinition, SensorKey } from './types';

const hex2 = (n: number) => n.toString(16).toUpperCase().padStart(2, '0');

function def(
  pid: number,
  label: string,
  unit: string,
  bytes: number,
  min: number,
  max: number,
  decimals: number,
  category: PidDefinition['category'],
  description: string,
  decode: (d: number[]) => number,
  decodeText?: (d: number[]) => string,
): PidDefinition {
  return {
    mode: 0x01,
    pid,
    key: `01:${hex2(pid)}`,
    label,
    description,
    unit,
    bytes,
    min,
    max,
    decimals,
    category,
    decode,
    decodeText,
  };
}

const FUEL_SYSTEM_STATUS: Record<number, string> = {
  0: 'Hors boucle',
  1: 'Boucle ouverte — moteur froid',
  2: 'Boucle fermée — sonde lambda active',
  4: 'Boucle ouverte — charge / décélération',
  8: 'Boucle ouverte — défaut système',
  16: 'Boucle fermée — sonde lambda en défaut',
};

/**
 * Définitions des PID du mode 01 (données temps réel, SAE J1979).
 * Toutes les formules proviennent de la norme ; elles sont purement
 * arithmétiques et ne renvoient jamais de commande au véhicule.
 */
export const PID_DEFINITIONS: PidDefinition[] = [
  def(
    0x04,
    'Charge moteur',
    '%',
    1,
    0,
    100,
    1,
    'moteur',
    'Charge calculée du moteur : couple actuel rapporté au couple maximal disponible.',
    (d) => (d[0] * 100) / 255,
  ),
  def(
    0x05,
    'Temp. liquide refroid.',
    '°C',
    1,
    -40,
    140,
    0,
    'temperature',
    "Température du liquide de refroidissement moteur. Régime normal : 80–105 °C.",
    (d) => d[0] - 40,
  ),
  def(
    0x06,
    'Trim court terme B1',
    '%',
    1,
    -100,
    100,
    1,
    'carburant',
    "Correction de richesse à court terme, banc 1. Au-delà de ±10 % : entrée d'air parasite ou injecteur en dérive.",
    (d) => (d[0] * 100) / 128 - 100,
  ),
  def(
    0x07,
    'Trim long terme B1',
    '%',
    1,
    -100,
    100,
    1,
    'carburant',
    'Correction de richesse à long terme apprise par le calculateur, banc 1.',
    (d) => (d[0] * 100) / 128 - 100,
  ),
  def(
    0x0a,
    'Pression carburant',
    'kPa',
    1,
    0,
    765,
    0,
    'carburant',
    'Pression carburant à la rampe (jauge basse pression).',
    (d) => d[0] * 3,
  ),
  def(
    0x0b,
    'Pression collecteur',
    'kPa',
    1,
    0,
    255,
    0,
    'admission',
    "Pression absolue dans le collecteur d'admission (MAP).",
    (d) => d[0],
  ),
  def(
    0x0c,
    'Régime moteur',
    'tr/min',
    2,
    0,
    8000,
    0,
    'moteur',
    'Vitesse de rotation du vilebrequin.',
    (d) => (d[0] * 256 + d[1]) / 4,
  ),
  def(
    0x0d,
    'Vitesse véhicule',
    'km/h',
    1,
    0,
    255,
    0,
    'vehicule',
    'Vitesse véhicule mesurée par le calculateur.',
    (d) => d[0],
  ),
  def(
    0x0e,
    'Avance allumage',
    '°',
    1,
    -64,
    64,
    1,
    'moteur',
    "Avance à l'allumage par rapport au point mort haut, cylindre 1.",
    (d) => d[0] / 2 - 64,
  ),
  def(
    0x0f,
    'Temp. air admission',
    '°C',
    1,
    -40,
    120,
    0,
    'temperature',
    "Température de l'air entrant dans le collecteur d'admission.",
    (d) => d[0] - 40,
  ),
  def(
    0x10,
    'Débit d’air (MAF)',
    'g/s',
    2,
    0,
    400,
    2,
    'admission',
    "Débit massique d'air mesuré par le débitmètre.",
    (d) => (d[0] * 256 + d[1]) / 100,
  ),
  def(
    0x11,
    'Position papillon',
    '%',
    1,
    0,
    100,
    1,
    'admission',
    'Position absolue du papillon des gaz.',
    (d) => (d[0] * 100) / 255,
  ),
  def(
    0x1f,
    'Temps depuis démarrage',
    's',
    2,
    0,
    65535,
    0,
    'moteur',
    'Durée écoulée depuis le démarrage du moteur.',
    (d) => d[0] * 256 + d[1],
  ),
  def(
    0x21,
    'Distance témoin allumé',
    'km',
    2,
    0,
    65535,
    0,
    'emissions',
    'Distance parcourue depuis que le témoin moteur (MIL) est allumé.',
    (d) => d[0] * 256 + d[1],
  ),
  def(
    0x2f,
    'Niveau carburant',
    '%',
    1,
    0,
    100,
    1,
    'carburant',
    'Niveau du réservoir de carburant.',
    (d) => (d[0] * 100) / 255,
  ),
  def(
    0x31,
    'Distance depuis effacement',
    'km',
    2,
    0,
    65535,
    0,
    'emissions',
    'Distance parcourue depuis le dernier effacement des codes défauts.',
    (d) => d[0] * 256 + d[1],
  ),
  def(
    0x33,
    'Pression atmosphérique',
    'kPa',
    1,
    0,
    255,
    0,
    'admission',
    "Pression barométrique absolue, utilisée pour la correction d'altitude.",
    (d) => d[0],
  ),
  def(
    0x42,
    'Tension calculateur',
    'V',
    2,
    0,
    18,
    2,
    'electrique',
    "Tension d'alimentation du calculateur moteur. Moteur tournant : 13,5–14,5 V attendus.",
    (d) => (d[0] * 256 + d[1]) / 1000,
  ),
  def(
    0x43,
    'Charge absolue',
    '%',
    2,
    0,
    255,
    1,
    'moteur',
    'Charge absolue : masse d’air admise rapportée au remplissage théorique maximal.',
    (d) => ((d[0] * 256 + d[1]) * 100) / 255,
  ),
  def(
    0x44,
    'Richesse commandée',
    'λ',
    2,
    0,
    2,
    3,
    'carburant',
    'Rapport air/carburant commandé, exprimé en lambda (1,000 = stœchiométrique).',
    (d) => (d[0] * 256 + d[1]) / 32768,
  ),
  def(
    0x45,
    'Papillon relatif',
    '%',
    1,
    0,
    100,
    1,
    'admission',
    'Position relative du papillon (après apprentissage du point zéro).',
    (d) => (d[0] * 100) / 255,
  ),
  def(
    0x46,
    'Temp. air ambiant',
    '°C',
    1,
    -40,
    120,
    0,
    'temperature',
    'Température de l’air extérieur mesurée par le calculateur.',
    (d) => d[0] - 40,
  ),
  def(
    0x5c,
    'Temp. huile moteur',
    '°C',
    1,
    -40,
    210,
    0,
    'temperature',
    'Température de l’huile moteur.',
    (d) => d[0] - 40,
  ),
  def(
    0x5e,
    'Consommation instant.',
    'L/h',
    2,
    0,
    100,
    2,
    'carburant',
    'Débit de carburant consommé par le moteur.',
    (d) => (d[0] * 256 + d[1]) / 20,
  ),
  def(
    0x03,
    'Statut système carburant',
    '',
    2,
    0,
    16,
    0,
    'carburant',
    'État de la boucle de régulation de richesse (ouverte / fermée).',
    (d) => d[0],
    (d) => FUEL_SYSTEM_STATUS[d[0]] ?? `Inconnu (0x${hex2(d[0])})`,
  ),
];

export const PID_BY_KEY: ReadonlyMap<SensorKey, PidDefinition> = new Map(
  PID_DEFINITIONS.map((p) => [p.key, p]),
);

export const PID_BY_NUMBER: ReadonlyMap<number, PidDefinition> = new Map(
  PID_DEFINITIONS.map((p) => [p.pid, p]),
);

/** PID affichés par défaut sur le tableau de bord principal. */
export const DEFAULT_DASHBOARD_PIDS: SensorKey[] = [
  '01:0C',
  '01:0D',
  '01:05',
  '01:04',
];

/** PID interrogés par défaut par la boucle d'acquisition. */
export const DEFAULT_POLLED_PIDS: SensorKey[] = [
  '01:0C',
  '01:0D',
  '01:05',
  '01:04',
  '01:11',
  '01:0F',
  '01:10',
  '01:42',
  '01:2F',
  '01:0B',
];

/**
 * Décode les bitmasks « PID supportés » (0x00, 0x20, 0x40, 0x60...).
 * Chaque réponse couvre 32 PID ; le bit de poids fort du 1er octet
 * correspond au PID `base + 1`.
 */
export function decodeSupportedPids(basePid: number, data: number[]): number[] {
  const supported: number[] = [];
  for (let byteIndex = 0; byteIndex < Math.min(4, data.length); byteIndex++) {
    for (let bit = 0; bit < 8; bit++) {
      const isSet = (data[byteIndex] & (0x80 >> bit)) !== 0;
      if (isSet) supported.push(basePid + byteIndex * 8 + bit + 1);
    }
  }
  return supported;
}

/** Décode le PID 0x01 : témoin moteur + nombre de codes défauts. */
export function decodeMonitorStatus(data: number[]) {
  return {
    milOn: (data[0] & 0x80) !== 0,
    dtcCount: data[0] & 0x7f,
  };
}

export function formatSensorValue(pid: PidDefinition, value: number): string {
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(pid.decimals);
}
