import { describe, expect, it } from 'vitest';
import {
  bytesToAscii,
  ElmResponseError,
  joinFrames,
  parseResponse,
  parseServiceResponse,
  splitLines,
} from '../src/obd/elmParser';
import { decodeMonitorStatus, decodeSupportedPids, PID_BY_KEY } from '../src/obd/pids';
import { decodeDtcBytes, decodeDtcPayload } from '../src/obd/dtc';

describe('moniteurs antipollution du mode 01', () => {
  it('distingue les trois états et ignore un bit incomplet sans support', () => {
    const status = decodeMonitorStatus([0x82, 0x21, 0x05, 0x06]);
    expect(status).toMatchObject({ milOn: true, dtcCount: 2 });
    expect(status.readiness).toEqual(expect.arrayContaining([
      { label: 'Ratés de combustion', state: 'ready' },
      { label: 'Système carburant', state: 'unsupported' },
      { label: 'Catalyseur', state: 'ready' },
      { label: 'Catalyseur chauffé', state: 'unsupported' },
      { label: 'Évaporation (EVAP)', state: 'incomplete' },
    ]));
    expect(decodeMonitorStatus([0, 0x11, 0, 0]).readiness?.[0]?.state).toBe('incomplete');
  });

  it('applique le masque diesel et ne montre pas les bits réservés', () => {
    const { readiness } = decodeMonitorStatus([0, 0x08, 0x49, 0x40]);
    expect(readiness).toEqual(expect.arrayContaining([
      { label: 'Catalyseur NMHC', state: 'ready' },
      { label: 'Pression de suralimentation', state: 'ready' },
      { label: 'Filtre à particules', state: 'incomplete' },
    ]));
    expect(readiness).toHaveLength(9);
    expect(readiness?.some(({ label }) => label === 'Évaporation (EVAP)')).toBe(false);
  });

  it('conserve le voyant sans inventer les états si les octets manquent', () => {
    expect(decodeMonitorStatus([0x81, 0x07, 0xe5])).toEqual({ milOn: true, dtcCount: 1 });
    expect(() => decodeMonitorStatus([])).toThrow(RangeError);
  });
});

describe('analyseur de réponses ELM327', () => {
  it('nettoie le prompt, les retours chariot et le bruit', () => {
    expect(splitLines('SEARCHING...\r410C1AF8\r\r>')).toEqual(['410C1AF8']);
  });

  it('détecte les erreurs adaptateur', () => {
    expect(() => parseResponse('NO DATA\r\r>')).toThrow(ElmResponseError);
    expect(() => parseResponse('UNABLE TO CONNECT\r>')).toThrow(/liaison/i);
    expect(() => parseResponse('CAN ERROR\r>')).toThrow(ElmResponseError);
  });

  it('reconstitue une réponse multi-trames ISO-TP', () => {
    const lines = ['014', '0:490201314654', '1:52583138573158', '2:4B41303030303030'];
    expect(joinFrames(lines)).toBe('49020131465452583138573158' + '4B41303030303030');
  });

  it('décode une réponse mode 01 simple', () => {
    const data = parseServiceResponse('410C1AF8\r\r>', 0x01, 0x0c);
    expect(data).toEqual([0x1a, 0xf8]);
    expect(PID_BY_KEY.get('01:0C')!.decode(data)).toBe(1726);
  });

  it('accepte les réponses avec espaces et en-têtes CAN', () => {
    const data = parseServiceResponse('7E8 03 41 0D 5A\r\r>', 0x01, 0x0d);
    expect(data[0]).toBe(0x5a);
  });

  it('accepte un en-tête CAN collé aux données (ATH1 + ATS0)', () => {
    const data = parseServiceResponse('7E803410D5A\r\r>', 0x01, 0x0d);
    expect(data[0]).toBe(0x5a);
  });

  it('refuse une réponse dont le PID ne correspond pas', () => {
    expect(() => parseServiceResponse('410D5A\r>', 0x01, 0x0c)).toThrow(/différent/);
  });

  it('signale une réponse négative du calculateur', () => {
    expect(() => parseServiceResponse('7F0112\r>', 0x01, 0x0c)).toThrow(/négative/);
  });

  it('convertit une charge utile ASCII (VIN)', () => {
    const bytes = 'VF1RFA00567123456'.split('').map((c) => c.charCodeAt(0));
    expect(bytesToAscii([0x00, ...bytes])).toBe('VF1RFA00567123456');
  });
});

describe('décodeurs de PID', () => {
  const cases: Array<[string, number[], number]> = [
    ['01:0C', [0x1a, 0xf8], 1726], // régime moteur
    ['01:0D', [0x5a], 90], // vitesse
    ['01:05', [0x7b], 83], // température liquide
    ['01:0F', [0x3c], 20], // température admission
    ['01:11', [0xff], 100], // papillon
    ['01:10', [0x01, 0xf4], 5], // débit d'air
    ['01:42', [0x37, 0x0e], 14.094], // tension calculateur
    ['01:0E', [0x80], 0], // avance allumage
    ['01:06', [0x80], 0], // trim court terme neutre
  ];

  for (const [key, bytes, expected] of cases) {
    it(`décode ${key}`, () => {
      const definition = PID_BY_KEY.get(key);
      expect(definition, key).toBeDefined();
      expect(definition!.decode(bytes)).toBeCloseTo(expected, 3);
    });
  }

  it('décode le bitmask des PID supportés', () => {
    // 0xBE1FA813 : bits de poids fort = PID 01, 03, 04, 05, 06, 07...
    const supported = decodeSupportedPids(0x00, [0xbe, 0x1f, 0xa8, 0x13]);
    expect(supported).toContain(0x0c);
    expect(supported).toContain(0x0d);
    expect(supported).not.toContain(0x02);
  });
});

describe('décodage des codes défauts', () => {
  it('décode un code générique moteur', () => {
    expect(decodeDtcBytes(0x03, 0x01, 'stored')?.code).toBe('P0301');
    expect(decodeDtcBytes(0x04, 0x20, 'stored')?.code).toBe('P0420');
  });

  it('décode les préfixes de système', () => {
    expect(decodeDtcBytes(0x43, 0x21, 'stored')?.system).toBe('C');
    expect(decodeDtcBytes(0x83, 0x21, 'stored')?.system).toBe('B');
    expect(decodeDtcBytes(0xc1, 0x00, 'stored')?.system).toBe('U');
  });

  it('ignore les emplacements vides', () => {
    expect(decodeDtcBytes(0x00, 0x00, 'stored')).toBeNull();
    expect(decodeDtcPayload([0x03, 0x01, 0x00, 0x00, 0x04, 0x20], 'stored')).toHaveLength(2);
  });

  it('associe une description connue', () => {
    expect(decodeDtcBytes(0x04, 0x20, 'stored')?.description).toMatch(/catalyseur/i);
  });

  it('déduplique les codes répétés', () => {
    expect(decodeDtcPayload([0x03, 0x01, 0x03, 0x01], 'stored')).toHaveLength(1);
  });
});
