/**
 * Garde-fou lecture seule — MIROIR de `src/obd/readOnlyGuard.ts`.
 *
 * Le bridge ouvre un port série sur la machine de l'utilisateur. Il ne doit
 * jamais faire confiance au client, même s'il s'agit de notre propre interface :
 * la validation est donc rejouée ici (défense en profondeur).
 *
 * ⚠ Toute modification des règles doit être répercutée dans les DEUX fichiers,
 * et les tests de `tests/readOnlyGuard.test.ts` doivent rester verts.
 */

const ALLOWED_OBD_MODES = new Set([0x01, 0x02, 0x03, 0x06, 0x07, 0x09, 0x0a]);

const FORBIDDEN_MODE_REASONS = {
  0x04: 'mode 04 = effacement des codes défauts (écriture ECU)',
  0x08: "mode 08 = pilotage d'un système embarqué",
  0x10: 'UDS DiagnosticSessionControl',
  0x11: 'UDS ECUReset',
  0x14: 'UDS ClearDiagnosticInformation',
  0x27: 'UDS SecurityAccess',
  0x28: 'UDS CommunicationControl',
  0x2e: 'UDS WriteDataByIdentifier',
  0x2f: 'UDS InputOutputControlByIdentifier',
  0x31: 'UDS RoutineControl',
  0x34: 'UDS RequestDownload',
  0x35: 'UDS RequestUpload',
  0x36: 'UDS TransferData',
  0x37: 'UDS RequestTransferExit',
  0x3b: 'KWP WriteDataByLocalIdentifier',
  0x3e: 'UDS TesterPresent',
  0x85: 'UDS ControlDTCSetting',
};

const ALLOWED_AT_PATTERNS = [
  /^ATZ$/, /^ATD$/, /^ATE[01]$/, /^ATL[01]$/, /^ATS[01]$/, /^ATH[01]$/,
  /^ATAT[012]$/, /^ATST[0-9A-F]{1,2}$/, /^ATSP[0-9A]$/, /^ATTP[0-9A]$/,
  /^ATDP$/, /^ATDPN$/, /^ATI$/, /^AT@1$/, /^ATRV$/, /^ATCAF[01]$/,
  /^ATM[01]$/, /^ATCRA[0-9A-F]{3,8}$/, /^ATAR$/, /^ATWS$/,
];

const FORBIDDEN_AT_PATTERNS = [
  [/^ATPP/, "écriture des paramètres persistants de l'adaptateur"],
  [/^ATIB/, 'modification du débit du bus ISO'],
  [/^ATSH/, "définition d'en-tête d'émission arbitraire"],
  [/^ATSD/, 'définition de données arbitraires à émettre'],
  [/^ATFC/, 'contrôle de flux CAN personnalisé'],
  [/^ATBRD/, "changement du débit série"],
  [/^ATMA/, 'surveillance permanente du bus'],
  [/^ATMR/, 'surveillance permanente du bus'],
  [/^ATMT/, 'surveillance permanente du bus'],
];

export function normalizeCommand(raw) {
  return String(raw).replace(/[\s\r\n]+/g, '').toUpperCase();
}

export function checkCommand(raw) {
  const normalized = normalizeCommand(raw);

  if (!normalized) return { allowed: false, reason: 'commande vide', normalized };
  if (normalized.length > 64) {
    return { allowed: false, reason: 'commande anormalement longue', normalized };
  }

  if (normalized.startsWith('ST')) {
    return { allowed: false, reason: 'commandes ST non auditées', normalized };
  }

  if (normalized.startsWith('AT')) {
    for (const [pattern, reason] of FORBIDDEN_AT_PATTERNS) {
      if (pattern.test(normalized)) return { allowed: false, reason, normalized };
    }
    if (ALLOWED_AT_PATTERNS.some((p) => p.test(normalized))) {
      return { allowed: true, reason: 'commande adaptateur autorisée', normalized };
    }
    return { allowed: false, reason: 'commande AT hors liste blanche', normalized };
  }

  if (!/^[0-9A-F]+$/.test(normalized)) {
    return { allowed: false, reason: 'trame non hexadécimale', normalized };
  }
  if (normalized.length % 2 !== 0) {
    return { allowed: false, reason: 'trame hexadécimale incomplète', normalized };
  }

  const mode = parseInt(normalized.slice(0, 2), 16);
  if (FORBIDDEN_MODE_REASONS[mode]) {
    return { allowed: false, reason: FORBIDDEN_MODE_REASONS[mode], normalized };
  }
  if (!ALLOWED_OBD_MODES.has(mode)) {
    return { allowed: false, reason: `mode 0x${mode.toString(16)} hors liste blanche`, normalized };
  }

  return { allowed: true, reason: 'mode de lecture autorisé', normalized };
}
