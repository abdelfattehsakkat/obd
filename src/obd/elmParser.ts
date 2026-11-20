/**
 * Analyse des réponses brutes d'un adaptateur ELM327.
 *
 * L'ELM327 est un pont ASCII : on lui envoie une commande terminée par CR,
 * il répond par une ou plusieurs lignes puis le prompt `>`.
 * Ce module ne fait qu'interpréter du texte — il n'émet jamais rien.
 */

export type ElmErrorKind =
  | 'NO_DATA'
  | 'UNABLE_TO_CONNECT'
  | 'BUS_ERROR'
  | 'CAN_ERROR'
  | 'STOPPED'
  | 'BUFFER_FULL'
  | 'UNSUPPORTED'
  | 'NEGATIVE_RESPONSE'
  | 'BAD_FORMAT';

export class ElmResponseError extends Error {
  readonly kind: ElmErrorKind;
  readonly raw: string;

  constructor(kind: ElmErrorKind, message: string, raw: string) {
    super(message);
    this.name = 'ElmResponseError';
    this.kind = kind;
    this.raw = raw;
  }
}

const ERROR_SIGNATURES: Array<[RegExp, ElmErrorKind, string]> = [
  [/NO\s*DATA/i, 'NO_DATA', "Le calculateur n'a pas répondu à cette requête (PID non supporté ou contact coupé)."],
  [/UNABLE\s*TO\s*CONNECT/i, 'UNABLE_TO_CONNECT', "Impossible d'établir la liaison avec le véhicule (contact mis ?)."],
  [/BUS\s*INIT.*ERROR/i, 'BUS_ERROR', "Échec d'initialisation du bus de diagnostic."],
  [/BUS\s*ERROR/i, 'BUS_ERROR', 'Erreur électrique sur le bus de diagnostic.'],
  [/CAN\s*ERROR/i, 'CAN_ERROR', 'Erreur du contrôleur CAN de l’adaptateur.'],
  [/DATA\s*ERROR/i, 'BUS_ERROR', 'Erreur de données sur le bus (checksum invalide).'],
  [/STOPPED/i, 'STOPPED', 'Requête interrompue par l’adaptateur.'],
  [/BUFFER\s*FULL/i, 'BUFFER_FULL', 'Tampon de l’adaptateur saturé.'],
  [/^\?$/m, 'UNSUPPORTED', "Commande non comprise par l'adaptateur."],
];

/** Lignes de bruit à ignorer systématiquement. */
const NOISE = /^(SEARCHING\.*|BUS\s*INIT\.*|OK)$/i;

export interface ParsedFrame {
  /** Octets utiles, en-tête de service inclus (ex. `[0x41, 0x0C, 0x1A, 0xF8]`). */
  bytes: number[];
  /** Lignes brutes nettoyées, utiles pour le terminal de debug. */
  lines: string[];
}

/** Découpe une réponse brute en lignes exploitables. */
export function splitLines(raw: string): string[] {
  return raw
    .replace(/\u0000/g, '')
    .split(/[\r\n]+/)
    .map((l) => l.replace(/>/g, '').trim())
    .filter((l) => l.length > 0 && !NOISE.test(l));
}

/** Détecte un message d'erreur ELM327 dans la réponse brute. */
export function detectError(raw: string): ElmResponseError | null {
  for (const [pattern, kind, message] of ERROR_SIGNATURES) {
    if (pattern.test(raw)) return new ElmResponseError(kind, message, raw.trim());
  }
  return null;
}

/**
 * Retire l'en-tête CAN d'une ligne lorsque `ATH1` est actif.
 *
 * Un identifiant CAN 11 bits s'affiche sur 3 caractères hexadécimaux
 * (ex. `7E8`) : il n'est donc PAS aligné sur un octet et décalerait tout le
 * décodage s'il était concaténé aux données.
 */
export function stripCanHeader(line: string): string {
  const tokens = line.trim().split(/\s+/).filter(Boolean);

  if (tokens.length > 1) {
    // En-tête 11 bits (`7E8`) ou 29 bits (`18DAF110`) séparé par des espaces.
    if (/^[0-9A-F]{3}$/i.test(tokens[0]) || /^[0-9A-F]{8}$/i.test(tokens[0])) {
      return tokens.slice(1).join('');
    }
  }

  const compact = tokens.join('');
  // Sans espaces (`ATS0`), un en-tête 11 bits rend la ligne de longueur impaire.
  if (compact.length % 2 === 1 && compact.length > 3) return compact.slice(3);
  return compact;
}

/**
 * Reconstitue la charge utile d'une réponse, y compris les réponses
 * multi-trames ISO-TP affichées par l'ELM327 sous la forme :
 *   014
 *   0:490201314654
 *   1:52583138573158
 */
export function joinFrames(lines: string[]): string {
  const dataLines: string[] = [];
  let sawIndexedLine = false;

  for (const line of lines) {
    const indexed = /^([0-9A-F]):\s*([0-9A-F\s]+)$/i.exec(line);
    if (indexed) {
      sawIndexedLine = true;
      dataLines.push(indexed[2].replace(/\s+/g, ''));
      continue;
    }
    // Ligne de longueur totale ISO-TP (3 caractères hexa) précédant les trames.
    if (/^[0-9A-F]{3}$/i.test(line)) continue;
    dataLines.push(stripCanHeader(line));
  }

  if (sawIndexedLine) return dataLines.join('');

  // Sans indexation : plusieurs calculateurs peuvent répondre. On garde la
  // première ligne exploitable pour rester déterministe.
  return dataLines[0] ?? '';
}

export function hexToBytes(hex: string): number[] {
  const clean = hex.replace(/[^0-9A-F]/gi, '');
  const bytes: number[] = [];
  for (let i = 0; i + 1 < clean.length; i += 2) {
    bytes.push(parseInt(clean.slice(i, i + 2), 16));
  }
  return bytes;
}

export function bytesToHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

/**
 * Analyse générique : nettoie, détecte les erreurs, reconstitue les octets.
 * @throws ElmResponseError si la réponse est une erreur adaptateur/bus.
 */
export function parseResponse(raw: string): ParsedFrame {
  const error = detectError(raw);
  if (error) throw error;

  const lines = splitLines(raw);
  if (lines.length === 0) {
    throw new ElmResponseError('NO_DATA', 'Réponse vide de l’adaptateur.', raw.trim());
  }

  const joined = joinFrames(lines);
  if (!/^[0-9A-F]+$/i.test(joined) || joined.length < 2) {
    throw new ElmResponseError(
      'BAD_FORMAT',
      `Réponse non hexadécimale : « ${lines.join(' | ')} »`,
      raw.trim(),
    );
  }

  return { bytes: hexToBytes(joined), lines };
}

/**
 * Analyse la réponse d'une requête mode 01/02 et retourne les octets de
 * données, en-tête `4X PID` retiré.
 */
export function parseServiceResponse(
  raw: string,
  mode: number,
  pid?: number,
): number[] {
  const { bytes, lines } = parseResponse(raw);
  const expected = mode + 0x40;

  // Réponse négative ISO 14229 : 7F <service> <NRC>
  if (bytes[0] === 0x7f) {
    throw new ElmResponseError(
      'NEGATIVE_RESPONSE',
      `Réponse négative du calculateur (service 0x${bytes[1]?.toString(16).toUpperCase()}, code 0x${bytes[2]
        ?.toString(16)
        .toUpperCase()}).`,
      lines.join(' | '),
    );
  }

  const headerIndex = bytes.indexOf(expected);
  if (headerIndex === -1) {
    throw new ElmResponseError(
      'BAD_FORMAT',
      `En-tête de réponse 0x${expected.toString(16).toUpperCase()} introuvable dans « ${lines.join(' | ')} ».`,
      lines.join(' | '),
    );
  }

  let offset = headerIndex + 1;

  if (pid !== undefined) {
    if (bytes[offset] !== pid) {
      throw new ElmResponseError(
        'BAD_FORMAT',
        `PID renvoyé (0x${bytes[offset]?.toString(16).toUpperCase()}) différent du PID demandé (0x${pid
          .toString(16)
          .toUpperCase()}).`,
        lines.join(' | '),
      );
    }
    offset += 1;
  }

  return bytes.slice(offset);
}

/** Convertit des octets ASCII (mode 09) en chaîne lisible. */
export function bytesToAscii(bytes: number[]): string {
  return bytes
    .filter((b) => b >= 0x20 && b <= 0x7e)
    .map((b) => String.fromCharCode(b))
    .join('')
    .trim();
}
