# OBD Scope

Outil de diagnostic automobile **strictement en lecture seule**, connecté à un adaptateur ELM327
(Bluetooth LE, Bluetooth classique via passerelle, ou USB).

> **Aucune commande capable de modifier un calculateur ne peut être émise par cette application.**
> Voir [docs/SECURITE-LECTURE-SEULE.md](docs/SECURITE-LECTURE-SEULE.md).

---

## Démarrage rapide

```bash
npm ci       # première installation des dépendances
./dev.sh
```

Ouvrir l'adresse affichée dans le terminal (par défaut <http://127.0.0.1:5173>). Le script démarre
uniquement l'interface locale, sans passerelle ni connexion au véhicule. Laisser **« Banc virtuel
(démo) »** sélectionné et cliquer sur **Connecter** pour explorer l'application sans matériel.

## Fonctionnalités

| Écran | Contenu |
| --- | --- |
| **Tableau de bord** | 4 jauges principales (régime, vitesse, température, charge), courbes temps réel, paramètres secondaires, identification véhicule |
| **Données temps réel** | Tous les PID du mode 01 supportés par le calculateur, avec valeur, unité, tendance et activation individuelle de l'acquisition |
| **Codes défauts** | Codes confirmés (mode 03), en attente (mode 07) et permanents (mode 0A), témoin moteur et état de préparation des moniteurs antipollution (PID `01:01`) |
| **Véhicule & adaptateur** | Profil d'affichage manuel, VIN, identifiant de calibration, nom du calculateur, protocole, firmware de l'adaptateur, liste des capteurs déclarés |
| **Console** | Terminal des échanges ELM327 avec envoi de commandes expertes — chaque saisie est validée en direct par le garde-fou |

## Connexion à un vrai véhicule

Dans **Véhicule & adaptateur**, le profil **Générique** est sélectionné par défaut et accepte un nom
de modèle facultatif. Les profils **Chevrolet Sonic T300 1.2** et **Chevrolet Aveo T250 1.2** ne
changent pas les commandes envoyées ni la détection des capteurs. Le choix reste en mémoire jusqu'au
rechargement de la page ; les identifiants lus ne sélectionnent jamais de profil automatiquement.

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
