import { describe, expect, it } from 'vitest';
import { ObdSession } from '../src/core/ObdSession';
import { DemoTransport } from '../src/transport/DemoTransport';
import { ReadOnlyViolationError } from '../src/obd/readOnlyGuard';
import type {
  ConnectionState,
  MonitorStatus,
  SensorKey,
  SensorSample,
  VehicleInfo,
} from '../src/obd/types';

function createSession() {
  const states: ConnectionState[] = [];
  const samples: SensorSample[] = [];
  let vehicleInfo: VehicleInfo = {};
  let supported: SensorKey[] = [];
  let monitor: MonitorStatus | null = null;

  const transport = new DemoTransport(1);
  const session = new ObdSession(transport, {
    onState: (state) => states.push(state),
    onLog: () => undefined,
    onSample: (sample) => samples.push(sample),
    onVehicleInfo: (info) => (vehicleInfo = info),
    onSupportedPids: (keys) => (supported = keys),
    onMonitorStatus: (status) => (monitor = status),
    onError: () => undefined,
  });

  return {
    session,
    states,
    samples,
    get vehicleInfo() {
      return vehicleInfo;
    },
    get supported() {
      return supported;
    },
    get monitor() {
      return monitor;
    },
  };
}

describe('session OBD de bout en bout (banc virtuel)', () => {
  it('initialise l’adaptateur et découvre le véhicule', async () => {
    const ctx = createSession();
    await ctx.session.start();

    expect(ctx.states).toEqual(['connecting', 'initializing', 'ready']);
    expect(ctx.vehicleInfo.vin).toBe('VF1RFA00567123456');
    expect(ctx.vehicleInfo.protocol).toContain('ISO 15765-4');
    expect(ctx.vehicleInfo.adapterVersion).toContain('ELM327');
    expect(ctx.vehicleInfo.batteryVoltage).toBeGreaterThan(13);
    expect(ctx.vehicleInfo.ecuName).toBe('ECM-EngineControl');
    expect(ctx.vehicleInfo.calibrationId).toBe('SW-EDC17C42-0091');

    await ctx.session.stop();
  });

  it('déclare les capteurs supportés par le calculateur', async () => {
    const ctx = createSession();
    await ctx.session.start();

    expect(ctx.supported).toContain('01:0C');
    expect(ctx.supported).toContain('01:0D');
    expect(ctx.supported).toContain('01:05');
    expect(ctx.supported.length).toBeGreaterThan(10);

    await ctx.session.stop();
  });

  it('lit des valeurs de capteurs cohérentes', async () => {
    const ctx = createSession();
    await ctx.session.start();

    const rpm = await ctx.session.readSensor('01:0C');
    expect(rpm).not.toBeNull();
    expect(rpm!.value).toBeGreaterThan(600);
    expect(rpm!.value).toBeLessThan(7000);

    const coolant = await ctx.session.readSensor('01:05');
    expect(coolant!.value).toBeGreaterThan(-40);
    expect(coolant!.value).toBeLessThan(140);

    const speed = await ctx.session.readSensor('01:0D');
    expect(speed!.value).toBeGreaterThanOrEqual(0);
    expect(speed!.value).toBeLessThanOrEqual(255);

    await ctx.session.stop();
  });

  it('accumule des échantillons via la boucle d’acquisition', async () => {
    const ctx = createSession();
    await ctx.session.start();
    ctx.session.startPolling(['01:0C', '01:0D', '01:05'], 0);

    await new Promise((resolve) => setTimeout(resolve, 320));
    ctx.session.stopPolling();

    expect(ctx.samples.length).toBeGreaterThan(5);
    expect(new Set(ctx.samples.map((s) => s.key)).size).toBe(3);

    await ctx.session.stop();
  });

  it('lit les codes défauts confirmés, en attente et permanents', async () => {
    const ctx = createSession();
    await ctx.session.start();

    const dtcs = await ctx.session.readDtcs();
    const codes = dtcs.map((d) => `${d.kind}:${d.code}`);

    expect(codes).toContain('stored:P0301');
    expect(codes).toContain('stored:P0420');
    expect(codes).toContain('pending:P0171');
    expect(codes).toContain('permanent:P0420');

    expect(ctx.monitor).not.toBeNull();
    expect(ctx.monitor!.milOn).toBe(true);
    expect(ctx.monitor!.dtcCount).toBe(2);

    await ctx.session.stop();
  });

  it('refuse toute commande d’écriture envoyée depuis la console', async () => {
    const ctx = createSession();
    await ctx.session.start();

    await expect(ctx.session.sendManual('04')).rejects.toBeInstanceOf(ReadOnlyViolationError);
    await expect(ctx.session.sendManual('2E0100')).rejects.toBeInstanceOf(ReadOnlyViolationError);
    await expect(ctx.session.sendManual('ATSH7E0')).rejects.toBeInstanceOf(ReadOnlyViolationError);

    // Une lecture reste possible juste après un refus : la file n'est pas bloquée.
    await expect(ctx.session.sendManual('010C')).resolves.toMatch(/^410C/);

    await ctx.session.stop();
  });

  it('sérialise les requêtes concurrentes sans mélanger les réponses', async () => {
    const ctx = createSession();
    await ctx.session.start();

    const results = await Promise.all([
      ctx.session.readSensor('01:0C'),
      ctx.session.readSensor('01:0D'),
      ctx.session.readSensor('01:05'),
      ctx.session.readSensor('01:11'),
    ]);

    expect(results.map((r) => r!.key)).toEqual(['01:0C', '01:0D', '01:05', '01:11']);

    await ctx.session.stop();
  });
});
