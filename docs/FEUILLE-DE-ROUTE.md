# Feuille de route

État actuel : **POC web fonctionnel**, testé sur banc virtuel, prêt pour essai sur véhicule réel.

---

## Fait

- [x] Couche protocole OBD-II / ELM327 complète et testée (26 PID, modes 03/07/0A, mode 09)
- [x] Garde-fou lecture seule à liste blanche, avec miroir côté bridge
- [x] Transport Bluetooth LE (Web Bluetooth) avec 5 profils GATT + détection automatique
- [x] Passerelle série pour Bluetooth classique / USB, durcie (localhost, contrôle d'origine)
- [x] Simulateur ELM327 + véhicule permettant de développer et tester sans matériel
- [x] Interface de diagnostic : tableau de bord, données temps réel, codes défauts, identification, console
- [x] 112 tests automatisés (protocole, sécurité, session, interface)

---

## Étape suivante — validation sur véhicule

1. Basculer le dongle en **Bluetooth LE** et vérifier qu'il reste stable.
2. Se connecter contact mis, moteur arrêté ; vérifier le VIN et la liste des PID découverts.
3. Comparer quelques valeurs avec l'application mobile de référence.
4. Si le BLE est instable → passer par `npm run bridge`.
5. Si un profil GATT manque → relever les UUID et l'ajouter (voir `docs/MATERIEL-CONNEXION.md`).

---

## Court terme

- [ ] **Ajuster les seuils d'alerte** des jauges au véhicule réel (actuellement génériques)
- [ ] **Mode 02 — données figées** : afficher le contexte enregistré au moment d'un code défaut.
      C'est l'information la plus utile au diagnostic, et elle est déjà autorisée par le garde-fou.
- [ ] **Mode 06 — moniteurs embarqués** : état de préparation au contrôle technique
- [ ] **Export CSV** de la session en cours (sans base de données)
- [ ] **Sondes lambda** (PID `14`–`1B`, `24`–`2B`) — utiles pour le diagnostic de richesse
- [ ] **Windows** : support des ports `COM` dans la passerelle (via `serialport`)
- [ ] **Transport Wi-Fi** : certains dongles exposent un socket TCP sur `192.168.0.10:35000`
      (nécessite une passerelle, les navigateurs ne faisant pas de TCP brut)

## Moyen terme — historique

À décider selon l'usage (le stockage a été volontairement écarté du POC) :

| Option | Avantages | Inconvénients |
| --- | --- | --- |
| **IndexedDB** (navigateur) | Aucune infrastructure, fonctionne hors ligne, adapté à un usage mono-poste | Données liées au navigateur, pas de partage |
| **SQLite via le bridge** | Fichier unique, requêtable, sauvegardable | Nécessite que le bridge tourne |
| **Serveur + Postgres/TimescaleDB** | Multi-appareils, séries temporelles optimisées | Infrastructure à maintenir |

Recommandation : commencer par **IndexedDB**, en isolant l'accès derrière une interface
`SessionStore` pour pouvoir changer d'implémentation sans toucher au reste.

Fonctionnalités associées : comparaison de trajets, détection de dérive d'un capteur, suivi
d'un code défaut intermittent.

## Long terme — application mobile

La couche `src/obd/` (protocole, décodeurs, garde-fou) est **pure TypeScript** et se réutilise
telle quelle.

| Approche | Réutilisation | Bluetooth classique (SPP) | Remarque |
| --- | --- | --- | --- |
| **React Native** | `src/obd/` + logique | ✅ via `react-native-bluetooth-classic` | Meilleur compromis : réécrire uniquement la couche transport et l'UI |
| **Capacitor** (portage direct) | Presque tout | ✅ via plugin | Le plus rapide, rendu moins natif |
| **Flutter** | ❌ réécriture en Dart | ✅ | À écarter sauf préférence forte pour Dart |
| **PWA + Web Bluetooth** | Tout | ❌ BLE uniquement, et rien sur iOS | Insuffisant |

Point d'attention : **Web Bluetooth n'existe pas sur iOS.** Une application iOS impose donc du
natif ou un plugin. Sur Android, la PWA reste une option viable si le dongle est en BLE.

---

## Non prévu — et pourquoi

- **Effacement des codes défauts (mode 04)** : hors périmètre par conception. Voir
  [SECURITE-LECTURE-SEULE.md](SECURITE-LECTURE-SEULE.md).
- **Tests d'actionneurs, codages, adaptations (UDS)** : nécessitent des commandes d'écriture, avec
  un risque réel pour le véhicule.
- **Comptes utilisateurs** : outil mono-utilisateur, aucune donnée à cloisonner.
