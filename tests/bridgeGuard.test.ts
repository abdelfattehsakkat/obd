import { describe, expect, it } from 'vitest';
import { checkCommand as checkTs } from '../src/obd/readOnlyGuard';
// @ts-expect-error — miroir JavaScript du garde-fou utilisé par le bridge Node.
import { checkCommand as checkBridge } from '../scripts/bridge/readOnlyGuard.mjs';

/**
 * Le bridge Node rejoue le garde-fou côté serveur (défense en profondeur).
 * Ce test garantit que les deux implémentations ne divergent jamais.
 */
const CORPUS = [
  '010C', '0100', '0105', '020C', '03', '0600', '07', '0902', '0A',
  '04', '0401', '08', '080101', '1002', '1101', '2701', '2E0100', '2F010300',
  '3101FF00', '3400', '3500', '3600', '3700', '3B01', '3E00', '8502', '1401',
  '99AA', '5501', '01ZZ', '010', '', '   ',
  'ATZ', 'ATE0', 'ATE1', 'ATL0', 'ATS0', 'ATS1', 'ATH0', 'ATH1', 'ATSP0',
  'ATDP', 'ATDPN', 'ATI', 'ATRV', 'AT@1', 'ATCAF1', 'ATST32', 'ATCRA7E8',
  'ATSH7E0', 'ATSD0102', 'ATPP2CSV01', 'ATMA', 'ATMR01', 'ATFCSD300000',
  'ATBRD08', 'ATIB10', 'ATXYZ', 'STDI', 'ST01',
  '01 0c', ' at e0 ',
];

describe('parité du garde-fou entre le client web et le bridge Node', () => {
  for (const command of CORPUS) {
    it(`traite « ${command || '(vide)'} » de façon identique`, () => {
      const ts = checkTs(command);
      const bridge = checkBridge(command) as { allowed: boolean; normalized: string };
      expect(bridge.allowed, `verdict divergent pour « ${command} »`).toBe(ts.allowed);
      expect(bridge.normalized).toBe(ts.normalized);
    });
  }

  it('le bridge refuse en plus les commandes anormalement longues', () => {
    const long = '01'.repeat(40);
    expect((checkBridge(long) as { allowed: boolean }).allowed).toBe(false);
  });
});
