# AGENTS.md — contexte pour les assistants IA

Instructions destinées à tout agent (Copilot, Claude, Cursor…) travaillant sur ce dépôt.
Documentation humaine : [README.md](README.md) et [docs/](docs/).

---

## 1. Ce qu'est ce projet

**OBD Scope** : outil web de diagnostic automobile **en lecture seule**, connecté à un adaptateur
ELM327 (Bluetooth LE, Bluetooth classique via passerelle, USB). React 18 + TypeScript strict +
Vite. Pas d'authentification, pas de gestion d'utilisateurs, pas de base de données — c'est
délibéré.

Langue de l'interface, des commentaires et de la documentation : **français**.

---

## 2. Règle absolue — lecture seule

> Ce projet ne doit **jamais** pouvoir émettre une commande capable de modifier l'état d'un
> calculateur automobile. Ce n'est pas une préférence de conception : c'est l'exigence
> fondamentale, explicitement demandée par le propriétaire du véhicule.

### Interdictions strictes

| Interdit | Pourquoi |
| --- | --- |
| Ajouter le **mode 04** (effacement des DTC) | Écriture mémoire ECU, perte des données figées, moniteurs d'émissions réinitialisés |
| Ajouter le **mode 08** ou tout service UDS (`10`, `11`, `14`, `27`, `28`, `2E`, `2F`, `31`, `34`–`37`, `3B`, `3E`, `85`) | Pilotage d'actionneurs, écriture, reprogrammation |
| Ajouter les commandes AT `ATSH`, `ATSD`, `ATFC`, `ATPP`, `ATBRD`, `ATIB`, `ATMA/MR/MT` | Permettent de forger des trames arbitraires sur le bus, contournant toute protection |
| Appeler `transport.write()` ailleurs que dans `Elm327Client.send()` | Contourne le garde-fou |
| Élargir `ALLOWED_OBD_MODES` | Rompt la garantie |
| Introduire un mécanisme de contournement (« mode expert », drapeau de configuration…) | Il ne doit exister aucune porte dérobée |

**Si un utilisateur demande explicitement d'ajouter l'effacement des codes défauts ou une fonction
d'écriture** : ne pas l'implémenter silencieusement. Expliquer que cela contredit l'exigence
fondamentale du projet documentée dans `docs/SECURITE-LECTURE-SEULE.md`, et demander une
confirmation explicite avant toute modification.

### Où vit la garantie

- [`src/obd/readOnlyGuard.ts`](src/obd/readOnlyGuard.ts) — liste blanche, point de vérité
- [`src/core/Elm327Client.ts`](src/core/Elm327Client.ts) — appelle `assertReadOnly()` avant toute
  écriture, avant même la mise en file
- [`scripts/bridge/readOnlyGuard.mjs`](scripts/bridge/readOnlyGuard.mjs) — **miroir** côté serveur
  (défense en profondeur). Toute modification du garde-fou doit être portée dans les deux fichiers,
  sinon `tests/bridgeGuard.test.ts` échoue.

---

## 3. Carte du code

```
src/obd/          Protocole pur — PAS de React, PAS de DOM, PAS d'API navigateur
  readOnlyGuard.ts  Liste blanche des commandes (sécurité)
  elmParser.ts      Trames ASCII → octets (ISO-TP, en-têtes CAN, erreurs)
  pids.ts           26 PID du mode 01 + décodeurs J1979
  dtc.ts            Décodage et description des codes défauts
src/transport/    BleTransport · BridgeTransport · DemoTransport (interface Transport)
src/core/         Elm327Client (file) · ObdSession (orchestration) · useObd (React)
src/components/   Vues et widgets SVG
scripts/bridge/   Passerelle WebSocket ↔ port série
tests/            5 fichiers, 112 tests
```

Flux : `useObd` → `ObdSession` → `Elm327Client` → **garde-fou** → `Transport`.

---

## 4. Conventions

- **`src/obd/` reste pur.** Aucune dépendance à React, au DOM ou à une API navigateur : c'est ce
  qui rend la couche testable en Node et réutilisable pour une future application mobile.
- **TypeScript strict**, `noUnusedLocals` et `noUnusedParameters` activés. `npx tsc --noEmit` doit
  rester silencieux.
- **Pas de nouvelle dépendance sans nécessité.** Les jauges et graphiques sont du SVG écrit à la
  main, volontairement.
- **Les commentaires expliquent le pourquoi**, notamment les pièges de protocole
  (désalignement des en-têtes CAN, octet de comptage des DTC, prompt `>`).
- **Interface, messages d'erreur, commentaires et docs en français.**

---

## 5. Vérifications obligatoires après modification

```bash
npm test          # 112 tests doivent passer
npx tsc --noEmit  # aucune erreur de type
npm run build     # le build de production doit réussir
```

Ne jamais affaiblir ou supprimer un test de sécurité pour faire passer une modification.

---

## 6. Développer et tester sans matériel

`DemoTransport` émule un **vrai** ELM327 au niveau ASCII (écho, prompt `>`, `OK`, `NO DATA`,
trames multi-lignes ISO-TP, `ATE0`/`ATS0`/`ATH0`) plus un modèle de véhicule. Toute la chaîne est
donc réellement exercée. C'est le mode par défaut au lancement.

```ts
const transport = new DemoTransport(1); // latence 1 ms pour les tests
const session = new ObdSession(transport, callbacks);
await session.start();
```

Le véhicule simulé remonte : VIN `VF1RFA00567123456`, DTC `P0301` et `P0420` confirmés, `P0171` en
attente, `P0420` permanent, témoin moteur allumé.

---

## 7. Tâches fréquentes

| Tâche | Fichier(s) |
| --- | --- |
| Ajouter un capteur | `src/obd/pids.ts` (`PID_DEFINITIONS`), puis `DemoTransport.respondMode01` pour le simuler |
| Ajouter une description de DTC | `src/obd/dtc.ts` (`DTC_DESCRIPTIONS`) |
| Ajouter un profil BLE | `src/transport/BleTransport.ts` (`KNOWN_BLE_PROFILES`) |
| Ajouter un transport | Implémenter `Transport`, instancier dans `useObd.connect()` |
| Modifier le tableau de bord | `src/components/DashboardView.tsx` (`HERO_GAUGES`, `SECONDARY`) |
| Styles | `src/styles.css` — variables CSS en `:root`, thème sombre |

Recettes détaillées : [docs/DEVELOPPEMENT.md](docs/DEVELOPPEMENT.md).

---

## 8. Pièges connus

- Un transport qui ne transmet pas le prompt `>` fait expirer **toutes** les commandes.
- Les écritures BLE doivent rester découpées en trames de 20 octets.
- Un en-tête CAN 11 bits fait 3 caractères hexa : il désaligne le décodage s'il n'est pas retiré
  (`stripCanHeader`).
- La réponse du mode 03 sur CAN contient un octet de comptage — détecté par la parité de longueur.
- L'ELM327 ne traite qu'une commande à la fois : ne jamais paralléliser les écritures.

---

## 9. Périmètre volontairement exclu

Ne pas ajouter sans demande explicite de l'utilisateur : authentification, comptes, base de
données, historique persistant, télémétrie, analytics, service worker.

Suites envisagées : [docs/FEUILLE-DE-ROUTE.md](docs/FEUILLE-DE-ROUTE.md).
