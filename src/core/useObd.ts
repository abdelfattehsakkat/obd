import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ObdSession } from './ObdSession';
import { BleTransport, isWebBluetoothAvailable } from '../transport/BleTransport';
import { BridgeTransport } from '../transport/BridgeTransport';
import { DemoTransport } from '../transport/DemoTransport';
import type { Transport, TransportKind } from '../transport/Transport';
import { DEFAULT_POLLED_PIDS } from '../obd/pids';
import type {
  ConnectionState,
  Dtc,
  LogEntry,
  MonitorStatus,
  SensorKey,
  SensorSample,
  VehicleInfo,
} from '../obd/types';

export interface HistoryPoint {
  t: number;
  v: number;
}

const MAX_HISTORY = 240;
const MAX_LOGS = 400;
const FLUSH_INTERVAL_MS = 120;

export interface ObdController {
  state: ConnectionState;
  stateDetail?: string;
  transportInfo?: Transport['info'];
  samples: Record<SensorKey, SensorSample>;
  history: Record<SensorKey, HistoryPoint[]>;
  logs: LogEntry[];
  vehicleInfo: VehicleInfo;
  supportedPids: SensorKey[];
  dtcs: Dtc[];
  monitorStatus: MonitorStatus | null;
  error: string | null;
  polledKeys: SensorKey[];
  isScanningDtc: boolean;
  connect: (kind: TransportKind, bridgeUrl?: string) => Promise<void>;
  disconnect: () => Promise<void>;
  scanDtcs: () => Promise<void>;
  setPolledKeys: (keys: SensorKey[]) => void;
  togglePolledKey: (key: SensorKey) => void;
  sendManual: (command: string) => Promise<string>;
  clearLogs: () => void;
  bleAvailable: boolean;
}

export function useObd(): ObdController {
  const sessionRef = useRef<ObdSession | null>(null);
  const samplesRef = useRef<Record<SensorKey, SensorSample>>({});
  const historyRef = useRef<Record<SensorKey, HistoryPoint[]>>({});
  const logsRef = useRef<LogEntry[]>([]);
  const logIdRef = useRef(0);
  const dirtyRef = useRef(false);

  const [state, setState] = useState<ConnectionState>('disconnected');
  const [stateDetail, setStateDetail] = useState<string | undefined>();
  const [transportInfo, setTransportInfo] = useState<Transport['info'] | undefined>();
  const [samples, setSamples] = useState<Record<SensorKey, SensorSample>>({});
  const [history, setHistory] = useState<Record<SensorKey, HistoryPoint[]>>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [vehicleInfo, setVehicleInfo] = useState<VehicleInfo>({});
  const [supportedPids, setSupportedPids] = useState<SensorKey[]>([]);
  const [dtcs, setDtcs] = useState<Dtc[]>([]);
  const [monitorStatus, setMonitorStatus] = useState<MonitorStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [polledKeys, setPolledKeysState] = useState<SensorKey[]>(DEFAULT_POLLED_PIDS);
  const [isScanningDtc, setIsScanningDtc] = useState(false);

  const bleAvailable = useMemo(() => isWebBluetoothAvailable(), []);

  const pushLog = useCallback((direction: LogEntry['direction'], text: string) => {
    logIdRef.current += 1;
    const entry: LogEntry = {
      id: logIdRef.current,
      at: Date.now(),
      direction,
      text,
    };
    logsRef.current = [...logsRef.current.slice(-(MAX_LOGS - 1)), entry];
    dirtyRef.current = true;
  }, []);

  // Les échantillons arrivent à haute fréquence : on agrège dans des refs et
  // on ne déclenche un rendu React qu'à intervalle fixe.
  useEffect(() => {
    const timer = setInterval(() => {
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      setSamples({ ...samplesRef.current });
      setHistory({ ...historyRef.current });
      setLogs(logsRef.current);
    }, FLUSH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  const handleSample = useCallback((sample: SensorSample) => {
    samplesRef.current[sample.key] = sample;
    const series = historyRef.current[sample.key] ?? [];
    const next = [...series, { t: sample.at, v: sample.value }];
    historyRef.current[sample.key] = next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
    dirtyRef.current = true;
  }, []);

  const connect = useCallback(
    async (kind: TransportKind, bridgeUrl = 'ws://127.0.0.1:8787') => {
      if (sessionRef.current) await sessionRef.current.stop().catch(() => undefined);

      setError(null);
      samplesRef.current = {};
      historyRef.current = {};
      logsRef.current = [];
      setSamples({});
      setHistory({});
      setDtcs([]);
      setMonitorStatus(null);
      setVehicleInfo({});
      setSupportedPids([]);

      let transport: Transport;
      if (kind === 'ble') transport = new BleTransport();
      else if (kind === 'bridge') transport = new BridgeTransport(bridgeUrl);
      else transport = new DemoTransport();

      const session = new ObdSession(transport, {
        onState: (next, detail) => {
          setState(next);
          setStateDetail(detail);
          setTransportInfo({ ...transport.info });
        },
        onLog: pushLog,
        onSample: handleSample,
        onVehicleInfo: setVehicleInfo,
        onSupportedPids: setSupportedPids,
        onMonitorStatus: setMonitorStatus,
        onError: (message) => setError(message),
      });

      sessionRef.current = session;

      try {
        await session.start();
        setTransportInfo({ ...transport.info });
        session.startPolling(polledKeys);
        await session.readMonitorStatus();
      } catch (startError) {
        const message = (startError as Error).message;
        setError(message);
        setState('error');
        pushLog('error', message);
        await session.stop().catch(() => undefined);
        sessionRef.current = null;
      }
    },
    [handleSample, polledKeys, pushLog],
  );

  const disconnect = useCallback(async () => {
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session) await session.stop().catch(() => undefined);
    setState('disconnected');
    setStateDetail(undefined);
  }, []);

  const scanDtcs = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    setIsScanningDtc(true);
    try {
      const codes = await session.readDtcs();
      setDtcs(codes);
      pushLog('info', `Analyse terminée : ${codes.length} code(s) défaut trouvé(s).`);
    } catch (scanError) {
      pushLog('error', (scanError as Error).message);
    } finally {
      setIsScanningDtc(false);
    }
  }, [pushLog]);

  const setPolledKeys = useCallback((keys: SensorKey[]) => {
    setPolledKeysState(keys);
    sessionRef.current?.updatePolledKeys(keys);
  }, []);

  const togglePolledKey = useCallback(
    (key: SensorKey) => {
      setPolledKeysState((current) => {
        const next = current.includes(key)
          ? current.filter((k) => k !== key)
          : [...current, key];
        sessionRef.current?.updatePolledKeys(next);
        return next;
      });
    },
    [],
  );

  const sendManual = useCallback(async (command: string) => {
    const session = sessionRef.current;
    if (!session) throw new Error('Aucune session active.');
    return session.sendManual(command);
  }, []);

  const clearLogs = useCallback(() => {
    logsRef.current = [];
    setLogs([]);
  }, []);

  useEffect(() => {
    return () => {
      void sessionRef.current?.stop().catch(() => undefined);
    };
  }, []);

  return {
    state,
    stateDetail,
    transportInfo,
    samples,
    history,
    logs,
    vehicleInfo,
    supportedPids,
    dtcs,
    monitorStatus,
    error,
    polledKeys,
    isScanningDtc,
    connect,
    disconnect,
    scanDtcs,
    setPolledKeys,
    togglePolledKey,
    sendManual,
    clearLogs,
    bleAvailable,
  };
}
