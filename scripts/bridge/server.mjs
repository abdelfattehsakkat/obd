#!/usr/bin/env node
/**
 * Passerelle série ↔ WebSocket pour OBD Scope.
 * ============================================
 *
 * POURQUOI : les navigateurs n'exposent pas le Bluetooth CLASSIQUE (profil
 * SPP/RFCOMM) utilisé par la majorité des dongles ELM327. Ce bridge ouvre le
 * port série créé par l'appairage système et le relaie à l'application web.
 *
 * SÉCURITÉ :
 *   - écoute exclusivement sur 127.0.0.1 (jamais exposé au réseau) ;
 *   - vérifie l'en-tête `Origin` pour empêcher qu'un site tiers ouvert dans le
 *     même navigateur ne pilote le port série (WebSocket hijacking) ;
 *   - rejoue le garde-fou lecture seule sur chaque commande reçue ;
 *   - une seule session cliente à la fois.
 *
 * USAGE :
 *   npm run bridge -- --list                 # lister les ports série
 *   npm run bridge -- --port /dev/cu.OBDII   # ouvrir un port précis
 *   npm run bridge                           # auto-détection
 */

import { createServer } from 'node:http';
import { readdirSync, createReadStream, createWriteStream } from 'node:fs';
import { WebSocketServer } from 'ws';
import { checkCommand } from './readOnlyGuard.mjs';

const args = process.argv.slice(2);
const getArg = (name) => {
  const index = args.indexOf(name);
  return index !== -1 ? args[index + 1] : undefined;
};

const HOST = '127.0.0.1';
const PORT = Number(getArg('--ws-port') ?? 8787);
const ALLOWED_ORIGINS = new Set([
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://127.0.0.1:4173',
  'http://localhost:4173',
  ...(getArg('--origin') ? [getArg('--origin')] : []),
]);

/** Liste les ports série plausibles pour un adaptateur OBD. */
function listSerialPorts() {
  if (process.platform === 'win32') return [];
  try {
    return readdirSync('/dev')
      .filter((name) => /^(cu|tty)\.(?!Bluetooth-Incoming)/.test(name) || /^rfcomm\d+$/.test(name))
      .map((name) => `/dev/${name}`)
      .sort();
  } catch {
    return [];
  }
}

function guessPort() {
  const ports = listSerialPorts();
  const preferred = ports.find((p) => /obd|elm|vgate|viecar|konnwei|vlink/i.test(p));
  return preferred ?? ports.find((p) => p.startsWith('/dev/cu.')) ?? ports[0];
}

if (args.includes('--list')) {
  const ports = listSerialPorts();
  if (ports.length === 0) {
    console.log('Aucun port série détecté.');
    if (process.platform === 'win32') {
      console.log('Windows : utilisez plutôt le mode Bluetooth LE de l’application.');
    } else {
      console.log('Appairez d’abord l’adaptateur dans les réglages Bluetooth du système.');
    }
  } else {
    console.log('Ports série disponibles :');
    for (const port of ports) console.log(`  ${port}`);
  }
  process.exit(0);
}

const devicePath = getArg('--port') ?? guessPort();

if (!devicePath) {
  console.error('✕ Aucun port série trouvé. Lancez « npm run bridge -- --list » pour vérifier.');
  console.error('  Sur macOS/Linux, appairez l’adaptateur puis relancez.');
  process.exit(1);
}

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('OBD Scope bridge — lecture seule\n');
});

const wss = new WebSocketServer({
  server: httpServer,
  // Filtre anti-hijacking : seules les origines locales connues sont acceptées.
  verifyClient: ({ origin }) => {
    if (!origin) return true; // clients non navigateur (tests, CLI)
    if (ALLOWED_ORIGINS.has(origin)) return true;
    console.warn(`✕ Connexion refusée depuis une origine non autorisée : ${origin}`);
    return false;
  },
});

let activeClient = null;

wss.on('connection', (socket) => {
  if (activeClient) {
    socket.send(JSON.stringify({ type: 'error', message: 'Une session est déjà active.' }));
    socket.close();
    return;
  }

  activeClient = socket;
  console.log(`→ Client connecté. Ouverture de ${devicePath}…`);

  let input;
  let output;

  const closeSerial = () => {
    input?.destroy();
    output?.destroy();
    input = undefined;
    output = undefined;
  };

  try {
    input = createReadStream(devicePath, { flags: 'r' });
    output = createWriteStream(devicePath, { flags: 'w' });
  } catch (error) {
    socket.send(
      JSON.stringify({ type: 'error', message: `Ouverture de ${devicePath} impossible : ${error.message}` }),
    );
    socket.close();
    activeClient = null;
    return;
  }

  input.on('error', (error) => {
    console.error(`✕ Erreur de lecture série : ${error.message}`);
    socket.send(JSON.stringify({ type: 'error', message: `Port série : ${error.message}` }));
    socket.close();
  });

  output.on('error', (error) => {
    console.error(`✕ Erreur d’écriture série : ${error.message}`);
    socket.send(JSON.stringify({ type: 'error', message: `Port série : ${error.message}` }));
  });

  input.on('data', (chunk) => {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify({ type: 'data', data: chunk.toString('ascii') }));
    }
  });

  input.on('open', () => {
    socket.send(JSON.stringify({ type: 'status', state: 'open', detail: devicePath }));
    console.log(`✓ Port ${devicePath} ouvert.`);
  });

  socket.on('message', (payload) => {
    let message;
    try {
      message = JSON.parse(payload.toString());
    } catch {
      return;
    }
    if (message.type !== 'write' || typeof message.data !== 'string') return;

    const verdict = checkCommand(message.data);
    if (!verdict.allowed) {
      console.warn(`⚠ Commande bloquée : « ${verdict.normalized} » — ${verdict.reason}`);
      socket.send(
        JSON.stringify({
          type: 'error',
          message: `Commande bloquée par le bridge : ${verdict.reason}`,
        }),
      );
      return;
    }

    output?.write(`${verdict.normalized}\r`);
  });

  socket.on('close', () => {
    console.log('→ Client déconnecté, fermeture du port série.');
    closeSerial();
    activeClient = null;
  });
});

httpServer.listen(PORT, HOST, () => {
  console.log('┌─────────────────────────────────────────────────────┐');
  console.log('│  OBD Scope — passerelle série (LECTURE SEULE)        │');
  console.log('└─────────────────────────────────────────────────────┘');
  console.log(`  WebSocket : ws://${HOST}:${PORT}`);
  console.log(`  Port série : ${devicePath}`);
  console.log(`  Origines autorisées : ${[...ALLOWED_ORIGINS].join(', ')}`);
  console.log('\n  Dans l’application, choisissez « Bridge série » puis Connecter.');
  console.log('  Ctrl+C pour arrêter.\n');
});

process.on('SIGINT', () => {
  console.log('\nArrêt du bridge.');
  wss.close();
  httpServer.close(() => process.exit(0));
});
