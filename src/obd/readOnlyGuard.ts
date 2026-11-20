/**
 * GARDE-FOU LECTURE SEULE
 * =======================
 * Ce module est l'unique point de passage autorisé pour toute trame émise
 * vers l'adaptateur ELM327. Il applique une liste blanche stricte :
 *
 *  - Modes OBD-II de DIAGNOSTIC autorisés : 01, 02, 03, 06, 07, 09, 0A.
 *    Tous ces modes sont des requêtes de LECTURE définies par SAE J1979.
 *    Le calculateur y répond sans modifier son état.
 *
 *  - Mode 04 (« Clear/Reset emission-related diagnostic information ») est
 *    EXPLICITEMENT INTERDIT : c'est la seule commande J1979 qui écrit dans
 *    la mémoire du calculateur (effacement des DTC et des données figées).
 *
 *  - Tous les services UDS/KWP (10, 11, 27, 2E, 2F, 31, 34-37, 3E, 85...)
 *    sont interdits : ils permettent le forçage d'actionneurs, la
 *    reprogrammation ou la réinitialisation d'un calculateur.
 *
 *  - Commandes AT : liste blanche également. Les commandes AT s'adressent à
 *    l'adaptateur, pas au véhicule, mais on interdit celles qui écrivent la
 *    configuration persistante de l'adaptateur (ATPP ... SV / ON / OFF) et
 *    celles qui envoient des trames arbitraires sur le bus.
 *
 * Toute tentative bloquée lève `ReadOnlyViolationError`, ce qui remonte
 * jusqu'à l'UI. Il n'existe aucun mécanisme de contournement.
 */

export class ReadOnlyViolationError extends Error {
  readonly command: string;
  readonly reason: string;

  constructor(command: string, reason: string) {
    super(`Commande bloquée par le garde-fou lecture seule : « ${command} » — ${reason}`);
    this.name = 'ReadOnlyViolationError';
    this.command = command;
    this.reason = reason;
  }
}

/** Modes OBD-II de lecture autorisés (SAE J1979). */
export const ALLOWED_OBD_MODES = new Set([
  0x01, // Données temps réel
  0x02, // Données figées (freeze frame)
  0x03, // Codes défauts confirmés
  0x06, // Résultats des tests des moniteurs embarqués
  0x07, // Codes défauts en attente
  0x09, // Informations véhicule (VIN, Calibration ID...)
  0x0a, // Codes défauts permanents
]);

/** Modes explicitement dangereux, listés pour produire un message clair. */
const FORBIDDEN_MODE_REASONS: Record<number, string> = {
  0x04: "mode 04 = effacement des codes défauts et des données figées (écriture ECU)",
  0x08: "mode 08 = contrôle d'un système embarqué (pilotage d'actionneur)",
  0x10: 'service UDS DiagnosticSessionControl (ouverture de session de programmation)',
  0x11: 'service UDS ECUReset (redémarrage du calculateur)',
  0x14: 'service UDS ClearDiagnosticInformation (effacement mémoire défauts)',
  0x27: "service UDS SecurityAccess (déverrouillage des fonctions d'écriture)",
  0x28: 'service UDS CommunicationControl (coupure de communication bus)',
  0x2e: 'service UDS WriteDataByIdentifier (écriture de paramètre)',
  0x2f: "service UDS InputOutputControlByIdentifier (forçage d'entrée/sortie)",
  0x31: 'service UDS RoutineControl (lancement de routine constructeur)',
  0x34: 'service UDS RequestDownload (téléchargement vers le calculateur)',
  0x35: 'service UDS RequestUpload',
  0x36: 'service UDS TransferData (transfert de firmware)',
  0x37: 'service UDS RequestTransferExit',
  0x3b: 'service KWP WriteDataByLocalIdentifier (écriture de paramètre)',
  0x3e: 'service UDS TesterPresent (maintien de session de diagnostic étendue)',
  0x85: 'service UDS ControlDTCSetting (inhibition de la détection de défauts)',
};

/**
 * Commandes AT autorisées, exprimées en motifs.
 * Les motifs sont testés sur la commande normalisée (majuscules, sans espaces).
 */
const ALLOWED_AT_PATTERNS: RegExp[] = [
  /^ATZ$/, // reset de l'adaptateur (pas du véhicule)
  /^ATD$/, // réglages par défaut de l'adaptateur
  /^ATE[01]$/, // écho
  /^ATL[01]$/, // saut de ligne
  /^ATS[01]$/, // espaces dans les réponses
  /^ATH[01]$/, // affichage des en-têtes CAN
  /^ATAT[012]$/, // temporisation adaptative
  /^ATST[0-9A-F]{1,2}$/, // timeout de réponse
  /^ATSP[0-9A]$/, // sélection de protocole
  /^ATTP[0-9A]$/, // essai de protocole
  /^ATDP$/, // protocole courant (texte)
  /^ATDPN$/, // protocole courant (numéro)
  /^ATI$/, // identité de l'adaptateur
  /^AT@1$/, // description de l'appareil
  /^ATRV$/, // tension de la batterie mesurée par l'adaptateur
  /^ATCAF[01]$/, // formatage automatique CAN
  /^ATM[01]$/, // mémoire de l'adaptateur
  /^ATCRA[0-9A-F]{3,8}$/, // filtre d'adresse de réception
  /^ATAR$/, // filtre de réception automatique
  /^ATWS$/, // warm start de l'adaptateur
];

/** Commandes AT interdites avec justification explicite. */
const FORBIDDEN_AT_PATTERNS: Array<[RegExp, string]> = [
  [/^ATPP/, "écriture des paramètres persistants de l'adaptateur"],
  [/^ATIB/, 'modification du débit du bus ISO'],
  [/^ATSH/, "définition d'en-tête d'émission arbitraire sur le bus"],
  [/^ATSD/, 'définition de données arbitraires à émettre'],
  [/^ATFC/, 'contrôle de flux CAN personnalisé (émission de trames forgées)'],
  [/^ATBRD/, "changement du débit série de l'adaptateur"],
  [/^ATMA/, 'surveillance permanente du bus (bloque la file de commandes)'],
  [/^ATMR/, 'surveillance permanente du bus (bloque la file de commandes)'],
  [/^ATMT/, 'surveillance permanente du bus (bloque la file de commandes)'],
];

export interface CommandCheck {
  allowed: boolean;
  reason: string;
  /** Commande normalisée telle qu'elle sera transmise. */
  normalized: string;
}

/** Normalise une commande : majuscules, espaces et CR/LF retirés. */
export function normalizeCommand(raw: string): string {
  return raw.replace(/[\s\r\n]+/g, '').toUpperCase();
}

/**
 * Vérifie qu'une commande est en lecture seule.
 * Ne lève pas d'exception : retourne un verdict exploitable par l'UI.
 */
export function checkCommand(raw: string): CommandCheck {
  const normalized = normalizeCommand(raw);

  if (normalized.length === 0) {
    return { allowed: false, reason: 'commande vide', normalized };
  }

  if (normalized.startsWith('AT') || normalized.startsWith('ST')) {
    if (normalized.startsWith('ST')) {
      return {
        allowed: false,
        reason: 'commandes ST (STN/OBDLink) non auditées par le garde-fou',
        normalized,
      };
    }
    for (const [pattern, reason] of FORBIDDEN_AT_PATTERNS) {
      if (pattern.test(normalized)) {
        return { allowed: false, reason, normalized };
      }
    }
    if (ALLOWED_AT_PATTERNS.some((p) => p.test(normalized))) {
      return { allowed: true, reason: 'commande adaptateur en liste blanche', normalized };
    }
    return {
      allowed: false,
      reason: "commande AT absente de la liste blanche de l'outil",
      normalized,
    };
  }

  if (!/^[0-9A-F]+$/.test(normalized)) {
    return {
      allowed: false,
      reason: 'trame non hexadécimale',
      normalized,
    };
  }

  if (normalized.length % 2 !== 0) {
    return {
      allowed: false,
      reason: "nombre impair de caractères hexadécimaux (trame incomplète)",
      normalized,
    };
  }

  const mode = parseInt(normalized.slice(0, 2), 16);

  const forbiddenReason = FORBIDDEN_MODE_REASONS[mode];
  if (forbiddenReason) {
    return { allowed: false, reason: forbiddenReason, normalized };
  }

  if (!ALLOWED_OBD_MODES.has(mode)) {
    return {
      allowed: false,
      reason: `mode 0x${mode.toString(16).toUpperCase().padStart(2, '0')} hors de la liste blanche de lecture`,
      normalized,
    };
  }

  return {
    allowed: true,
    reason: `mode de lecture 0x${mode.toString(16).toUpperCase().padStart(2, '0')} autorisé`,
    normalized,
  };
}

/**
 * Variante stricte : retourne la commande normalisée ou lève
 * `ReadOnlyViolationError`. C'est cette fonction que la couche transport
 * doit appeler avant toute écriture.
 */
export function assertReadOnly(raw: string): string {
  const verdict = checkCommand(raw);
  if (!verdict.allowed) {
    throw new ReadOnlyViolationError(verdict.normalized || raw, verdict.reason);
  }
  return verdict.normalized;
}
