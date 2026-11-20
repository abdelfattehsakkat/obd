import { describe, expect, it } from 'vitest';
import {
  assertReadOnly,
  checkCommand,
  ReadOnlyViolationError,
} from '../src/obd/readOnlyGuard';

describe('garde-fou lecture seule', () => {
  it('autorise les modes de lecture OBD-II', () => {
    for (const cmd of ['010C', '0100', '02 02', '03', '0600', '07', '0902', '0A']) {
      expect(checkCommand(cmd).allowed, cmd).toBe(true);
    }
  });

  it('bloque le mode 04 (effacement des codes défauts)', () => {
    const verdict = checkCommand('04');
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain('effacement');
  });

  it('bloque le mode 08 (pilotage de système embarqué)', () => {
    expect(checkCommand('080101').allowed).toBe(false);
  });

  it('bloque les services UDS d’écriture et de reprogrammation', () => {
    const forbidden = ['1002', '1101', '2701', '2E0100', '2F010300', '3101FF00', '3400', '3E00', '8502'];
    for (const cmd of forbidden) {
      expect(checkCommand(cmd).allowed, cmd).toBe(false);
    }
  });

  it('bloque les modes inconnus non listés', () => {
    expect(checkCommand('99AA').allowed).toBe(false);
    expect(checkCommand('5501').allowed).toBe(false);
  });

  it('rejette les trames non hexadécimales ou incomplètes', () => {
    expect(checkCommand('01ZZ').allowed).toBe(false);
    expect(checkCommand('010').allowed).toBe(false);
    expect(checkCommand('').allowed).toBe(false);
  });

  it('autorise les commandes AT en liste blanche', () => {
    for (const cmd of ['ATZ', 'ATE0', 'ATL0', 'ATS0', 'ATH1', 'ATSP0', 'ATDP', 'ATRV', 'ATI']) {
      expect(checkCommand(cmd).allowed, cmd).toBe(true);
    }
  });

  it('bloque les commandes AT permettant de forger des trames', () => {
    for (const cmd of ['ATSH7E0', 'ATSD0102', 'ATPP2CSV01', 'ATMA', 'ATFCSD300000']) {
      expect(checkCommand(cmd).allowed, cmd).toBe(false);
    }
  });

  it('bloque les commandes ST non auditées', () => {
    expect(checkCommand('STDI').allowed).toBe(false);
  });

  it('normalise la casse et les espaces', () => {
    expect(checkCommand('01 0c').normalized).toBe('010C');
    expect(checkCommand('at e0').normalized).toBe('ATE0');
  });

  it('assertReadOnly lève une erreur typée pour une commande interdite', () => {
    expect(() => assertReadOnly('04')).toThrow(ReadOnlyViolationError);
    expect(assertReadOnly('01 0C')).toBe('010C');
  });
});
