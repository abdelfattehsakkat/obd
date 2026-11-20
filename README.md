# OBD Scope

Outil de diagnostic automobile **strictement en lecture seule**, connecté à un adaptateur ELM327
(Bluetooth LE, Bluetooth classique via passerelle, ou USB).

> **Aucune commande capable de modifier un calculateur ne peut être émise par cette application.**
> Voir [docs/SECURITE-LECTURE-SEULE.md](docs/SECURITE-LECTURE-SEULE.md).

---

## Démarrage rapide

```bash
npm install
npm run dev
```

Ouvrir <http://127.0.0.1:5173>, laisser l'interface sur **« Banc virtuel (démo) »** et cliquer sur
**Connecter**. Un véhicule simulé répond au protocole ELM327 réel : vous pouvez explorer toutes les
fonctionnalités sans matériel.

## Fonctionnalités

| Écran | Contenu |
| --- | --- |
| **Tableau de bord** | 4 jauges principales (régime, vitesse, température, charge), courbes temps réel, paramètres secondaires, identification véhicule |
| **Données temps réel** | Tous les PID du mode 01 supportés par le calculateur, avec valeur, unité, tendance et activation individuelle de l'acquisition |
| **Codes défauts** | Lecture des codes confirmés (mode 03), en attente (mode 07) et permanents (mode 0A), avec description en français et statut du témoin moteur |
| **Véhicule & adaptateur** | VIN, identifiant de calibration, nom du calculateur, protocole, firmware de l'adaptateur, liste des capteurs déclarés |
| **Console** | Terminal des échanges ELM327 avec envoi de commandes expertes — chaque saisie est validée en direct par le garde-fou |

## Connexion à un vrai véhicule

Trois interfaces sont disponibles dans le menu déroulant en haut à droite.

### 1. Bluetooth LE — recommandé

Fonctionne directement dans le navigateur (Chrome / Edge, desktop ou Android), sans logiciel
supplémentaire. Basculez d'abord votre adaptateur en mode **« Bluetooth LE (4.0+) »**.

### 2. Bridge série — Bluetooth classique (SPP) ou USB

Les navigateurs n'exposent pas le Bluetooth classique. Appairez l'adaptateur dans les réglages
système, puis lancez la passerelle locale :

```bash
npm run bridge -- --list          # lister les ports série
npm run bridge -- --port /dev/cu.OBDII
```

Choisissez ensuite **« Bridge série »** dans l'application.

### 3. Banc virtuel

Simulateur intégré. Aucun matériel requis.

Détails complets : [docs/MATERIEL-CONNEXION.md](docs/MATERIEL-CONNEXION.md).

## Est-ce risqué pour la voiture ?

Non, tant qu'on reste sur les requêtes de lecture normalisées SAE J1979 — ce que cette application
garantit par construction. Le raisonnement complet, la liste des commandes bloquées et les
précautions d'usage sont documentés dans
[docs/SECURITE-LECTURE-SEULE.md](docs/SECURITE-LECTURE-SEULE.md).

## Commandes

```bash
npm run dev        # serveur de développement
npm run build      # vérification de types + build de production
npm test           # 112 tests (garde-fou, protocole, session, interface)
npm run typecheck  # vérification TypeScript seule
npm run bridge     # passerelle série pour Bluetooth classique / USB
```

## Documentation

| Document | Pour qui |
| --- | --- |
| [docs/SECURITE-LECTURE-SEULE.md](docs/SECURITE-LECTURE-SEULE.md) | Comprendre les risques et les protections |
| [docs/MATERIEL-CONNEXION.md](docs/MATERIEL-CONNEXION.md) | Brancher son dongle, résoudre les problèmes |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Comprendre le code |
| [docs/PROTOCOLE-OBD.md](docs/PROTOCOLE-OBD.md) | Référence OBD-II / ELM327 |
| [docs/DEVELOPPEMENT.md](docs/DEVELOPPEMENT.md) | Contribuer, ajouter un capteur |
| [docs/FEUILLE-DE-ROUTE.md](docs/FEUILLE-DE-ROUTE.md) | Suites prévues (mobile, historique) |
| [AGENTS.md](AGENTS.md) | Contexte destiné aux assistants IA |

## Licence et avertissement

Projet personnel fourni tel quel. Le diagnostic automobile reste une activité technique : les
valeurs affichées sont celles rapportées par le calculateur, elles ne remplacent pas l'avis d'un
professionnel. N'utilisez jamais cet outil en conduisant.
