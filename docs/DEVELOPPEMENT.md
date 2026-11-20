# Guide de développement

## Prérequis

Node ≥ 20 (testé sur 22). Aucune dépendance native à compiler.

```bash
npm install
```

## Scripts

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Serveur de développement Vite sur <http://127.0.0.1:5173> |
| `npm run build` | Vérification de types puis build de production dans `dist/` |
| `npm run preview` | Sert le build de production |
| `npm test` | Suite complète (5 fichiers, 112 tests) |
| `npm run test:watch` | Tests en mode surveillance |
| `npm run typecheck` | `tsc --noEmit` seul |
| `npm run bridge` | Passerelle série (voir `docs/MATERIEL-CONNEXION.md`) |

## Développer sans véhicule

Le **banc virtuel** (`DemoTransport`) émule un ELM327 complet : écho, prompt `>`, `OK`, `NO DATA`,
trames multi-lignes, modes 01/02/03/07/09/0A, et un modèle de véhicule avec cycle de conduite
urbain de 120 s. C'est le mode par défaut au lancement.

Le simulateur injecte volontairement des codes défauts (`P0301`, `P0420` confirmés, `P0171` en
attente, `P0420` permanent) et allume le témoin moteur, afin que l'écran de diagnostic ait du
contenu réaliste.

---

## Recettes courantes

### Ajouter un capteur (PID du mode 01)

Une seule modification suffit : ajouter une entrée dans `PID_DEFINITIONS`
([`src/obd/pids.ts`](../src/obd/pids.ts)).

```ts
def(
  0x5a,                    // numéro de PID
  'Position pédale',       // libellé UI
  '%',                     // unité
  1,                       // nombre d'octets de données
  0, 100,                  // bornes (jauges et graphiques)
  1,                       // décimales
  'moteur',                // catégorie
  'Position relative de la pédale d’accélérateur.',
  (d) => (d[0] * 100) / 255,   // décodeur
),
```

Le capteur apparaît automatiquement dans « Données temps réel », dans la découverte des PID
supportés et dans la sélection d'acquisition. Ajoutez un cas dans `tests/elmParser.test.ts` pour
verrouiller la formule.

Pour le faire apparaître sur le tableau de bord, ajoutez sa clé dans `HERO_GAUGES` ou `SECONDARY`
([`src/components/DashboardView.tsx`](../src/components/DashboardView.tsx)). Pour qu'il soit
interrogé dès la connexion, ajoutez-la à `DEFAULT_POLLED_PIDS`.

Pour que le banc virtuel le simule aussi : ajouter le PID à `SUPPORTED_PIDS` et un `case` dans
`respondMode01` ([`src/transport/DemoTransport.ts`](../src/transport/DemoTransport.ts)).

### Ajouter une description de code défaut

Compléter `DTC_DESCRIPTIONS` dans [`src/obd/dtc.ts`](../src/obd/dtc.ts). Les codes absents
retombent sur une description de famille (`P04xx` → contrôle des émissions, etc.).

### Ajouter un profil BLE

Voir [docs/MATERIEL-CONNEXION.md § 2](MATERIEL-CONNEXION.md).

### Ajouter un transport

Implémenter l'interface `Transport` ([`src/transport/Transport.ts`](../src/transport/Transport.ts)) :
`connect`, `disconnect`, `write`, `onData`, `onDisconnect`, `connected`, `info`. Puis l'instancier
dans `useObd.connect()`.

Le transport reçoit uniquement des commandes **déjà validées** par le garde-fou — il n'a pas à
refaire cette vérification (sauf s'il franchit une frontière de confiance, comme le bridge).

---

## Règles à respecter

### Sécurité — non négociable

1. **Ne jamais appeler `transport.write()` directement.** Passer par `Elm327Client.send()`, qui
   applique `assertReadOnly()`.
2. **Ne jamais élargir `ALLOWED_OBD_MODES`** sans analyse écrite du risque dans
   [docs/SECURITE-LECTURE-SEULE.md](SECURITE-LECTURE-SEULE.md).
3. **Ne jamais ajouter de motif AT permettant de forger une trame** (`ATSH`, `ATSD`, `ATFC`…).
4. Toute modification du garde-fou doit être **répercutée dans le miroir du bridge**
   (`scripts/bridge/readOnlyGuard.mjs`) ; `tests/bridgeGuard.test.ts` échoue sinon.

### Code

- `src/obd/` reste **pur** : pas de React, pas de DOM, pas d'API navigateur. C'est ce qui rend la
  couche testable en Node et portable vers le mobile.
- TypeScript strict, `noUnusedLocals` et `noUnusedParameters` activés.
- Les commentaires expliquent le **pourquoi** (piège de protocole, contrainte matérielle), pas le
  quoi.
- Interface en français, y compris les messages d'erreur destinés à l'utilisateur.

---

## Tests

| Fichier | Couvre |
| --- | --- |
| `tests/readOnlyGuard.test.ts` | Liste blanche / noire des commandes |
| `tests/elmParser.test.ts` | Nettoyage des trames, ISO-TP, en-têtes CAN, décodeurs PID et DTC |
| `tests/session.test.ts` | Session complète sur le banc virtuel : init, découverte, acquisition, DTC, refus d'écriture, sérialisation des requêtes |
| `tests/bridgeGuard.test.ts` | Parité entre le garde-fou TypeScript et son miroir JavaScript |
| `tests/ui.test.tsx` | Rendu réel de l'interface en jsdom : connexion, jauges, DTC, blocage console |

Les tests d'interface s'exécutent en jsdom via le docblock `// @vitest-environment jsdom` ; les
autres tournent en Node pur.

### Écrire un test d'intégration

`DemoTransport` accepte une latence en paramètre : `new DemoTransport(1)` accélère fortement les
tests tout en conservant l'asynchronisme réel.

```ts
const transport = new DemoTransport(1);
const session = new ObdSession(transport, callbacks);
await session.start();
const rpm = await session.readSensor('01:0C');
```

---

## Pièges connus

- **Prompt `>` obligatoire.** Un transport qui ne transmet pas le prompt fait expirer toutes les
  commandes. Vérifier ce point en premier lors de l'ajout d'un transport.
- **Trames BLE limitées à 20 octets.** `BleTransport` découpe les écritures ; ne pas supprimer ce
  découpage.
- **Le mode démo n'échoue jamais.** Pensez à tester aussi les chemins d'erreur (`NO DATA`,
  déconnexion) avec de vraies conditions ou en instrumentant le simulateur.
- **`ATE0` doit être envoyé tôt.** Sans lui, chaque commande est renvoyée dans la réponse et
  perturbe l'analyse.
