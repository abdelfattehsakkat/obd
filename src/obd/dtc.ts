import type { Dtc, DtcKind } from './types';

const SYSTEM_PREFIX = ['P', 'C', 'B', 'U'] as const;

/**
 * Descriptions génériques SAE les plus fréquentes.
 * La liste complète compte plusieurs milliers d'entrées ; on couvre ici les
 * familles courantes et on retombe sur une description de famille sinon.
 */
const DTC_DESCRIPTIONS: Record<string, string> = {
  P0100: "Circuit débitmètre d'air (MAF) — défaut",
  P0101: "Débitmètre d'air (MAF) — plage / performance",
  P0102: "Débitmètre d'air (MAF) — signal trop bas",
  P0103: "Débitmètre d'air (MAF) — signal trop haut",
  P0110: "Capteur température air admission — circuit",
  P0113: "Capteur température air admission — signal trop haut",
  P0115: 'Capteur température liquide de refroidissement — circuit',
  P0117: 'Capteur température liquide de refroidissement — signal trop bas',
  P0118: 'Capteur température liquide de refroidissement — signal trop haut',
  P0120: 'Capteur position papillon / pédale — circuit A',
  P0121: 'Capteur position papillon A — plage / performance',
  P0128: 'Thermostat — température de régulation non atteinte',
  P0130: 'Sonde lambda amont banc 1 — circuit',
  P0131: 'Sonde lambda amont banc 1 — tension trop basse',
  P0133: 'Sonde lambda amont banc 1 — réponse lente',
  P0135: 'Sonde lambda amont banc 1 — chauffage défaillant',
  P0136: 'Sonde lambda aval banc 1 — circuit',
  P0141: 'Sonde lambda aval banc 1 — chauffage défaillant',
  P0171: 'Mélange trop pauvre — banc 1',
  P0172: 'Mélange trop riche — banc 1',
  P0174: 'Mélange trop pauvre — banc 2',
  P0175: 'Mélange trop riche — banc 2',
  P0300: 'Ratés de combustion aléatoires / multiples cylindres',
  P0301: 'Ratés de combustion — cylindre 1',
  P0302: 'Ratés de combustion — cylindre 2',
  P0303: 'Ratés de combustion — cylindre 3',
  P0304: 'Ratés de combustion — cylindre 4',
  P0305: 'Ratés de combustion — cylindre 5',
  P0306: 'Ratés de combustion — cylindre 6',
  P0325: 'Capteur de cliquetis banc 1 — circuit',
  P0335: 'Capteur régime vilebrequin A — circuit',
  P0340: "Capteur position arbre à cames banc 1 — circuit",
  P0401: 'Recirculation gaz échappement (EGR) — débit insuffisant',
  P0402: 'Recirculation gaz échappement (EGR) — débit excessif',
  P0403: 'Recirculation gaz échappement (EGR) — circuit de commande',
  P0420: 'Rendement catalyseur sous le seuil — banc 1',
  P0430: 'Rendement catalyseur sous le seuil — banc 2',
  P0442: 'Système EVAP — petite fuite détectée',
  P0455: 'Système EVAP — grosse fuite détectée',
  P0500: 'Capteur de vitesse véhicule — circuit',
  P0505: 'Système de ralenti — dysfonctionnement',
  P0562: 'Tension système trop basse',
  P0563: 'Tension système trop haute',
  P062F: 'Calculateur moteur — erreur mémoire EEPROM',
  P0700: 'Système de commande boîte de vitesses — défaut',
  P2002: 'Filtre à particules — rendement insuffisant banc 1',
  P2463: 'Filtre à particules — accumulation de suies excessive',
  U0100: 'Perte de communication avec le calculateur moteur',
  U0101: 'Perte de communication avec le calculateur de boîte',
  U0121: "Perte de communication avec le calculateur ABS",
  C0035: 'Capteur de vitesse roue avant gauche — circuit',
  C0040: 'Capteur de vitesse roue avant droite — circuit',
  B0001: 'Circuit de déploiement airbag conducteur',
};

const FAMILY_DESCRIPTIONS: Array<[RegExp, string]> = [
  [/^P00/, "Mesure air/carburant et régulation additionnelle"],
  [/^P01/, "Mesure air/carburant et régulation additionnelle"],
  [/^P02/, 'Circuit injecteurs / mesure carburant'],
  [/^P03/, "Système d'allumage ou ratés de combustion"],
  [/^P04/, 'Système de contrôle des émissions (EGR, EVAP, catalyseur)'],
  [/^P05/, 'Régulation de vitesse et signaux de commande auxiliaires'],
  [/^P06/, "Calculateur moteur — circuits de sortie et intégrité interne"],
  [/^P07/, 'Transmission / boîte de vitesses'],
  [/^P08/, 'Transmission / boîte de vitesses'],
  [/^P2/, 'Défaut générique moteur / émissions (plage étendue)'],
  [/^C/, 'Châssis : freinage, ABS, direction, suspension'],
  [/^B/, 'Carrosserie : airbags, climatisation, confort'],
  [/^U/, 'Réseau de communication entre calculateurs (CAN)'],
];

export function describeDtc(code: string): string {
  const known = DTC_DESCRIPTIONS[code];
  if (known) return known;
  for (const [pattern, text] of FAMILY_DESCRIPTIONS) {
    if (pattern.test(code)) return `${text} — code non répertorié`;
  }
  return 'Code non répertorié';
}

/**
 * Convertit deux octets bruts en code DTC lisible.
 * Bits 15-14 → système (P/C/B/U), bits 13-12 → 1er chiffre, puis 3 quartets.
 * Retourne `null` pour `0x0000` (emplacement vide).
 */
export function decodeDtcBytes(a: number, b: number, kind: DtcKind): Dtc | null {
  if (a === 0 && b === 0) return null;
  const system = SYSTEM_PREFIX[(a & 0xc0) >> 6];
  const firstDigit = (a & 0x30) >> 4;
  const secondDigit = a & 0x0f;
  const thirdDigit = (b & 0xf0) >> 4;
  const fourthDigit = b & 0x0f;
  const code = `${system}${firstDigit}${secondDigit.toString(16).toUpperCase()}${thirdDigit
    .toString(16)
    .toUpperCase()}${fourthDigit.toString(16).toUpperCase()}`;
  return {
    code,
    system,
    generic: firstDigit === 0,
    kind,
    description: describeDtc(code),
  };
}

/**
 * Décode une charge utile de mode 03 / 07 / 0A (suite de paires d'octets).
 * Les octets passés doivent déjà être débarrassés de l'en-tête de mode.
 */
export function decodeDtcPayload(data: number[], kind: DtcKind): Dtc[] {
  const codes: Dtc[] = [];
  for (let i = 0; i + 1 < data.length; i += 2) {
    const dtc = decodeDtcBytes(data[i], data[i + 1], kind);
    if (dtc && !codes.some((c) => c.code === dtc.code)) codes.push(dtc);
  }
  return codes;
}
