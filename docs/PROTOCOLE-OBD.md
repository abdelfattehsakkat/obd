# Référence protocole — OBD-II et ELM327

Document de référence pour comprendre et étendre la couche `src/obd/`.

---

## 1. La chaîne de communication

```
Application ─ ASCII ─▶ ELM327 ─ CAN/ISO ─▶ Calculateur (ECU)
```

L'ELM327 est un **traducteur**. On lui parle en texte ASCII ; il convertit en trames du protocole
de diagnostic du véhicule (ISO 15765-4 CAN, ISO 9141-2, KWP2000, J1850…) et retraduit les réponses
en texte.

Deux familles de commandes :

| Préfixe | Destinataire | Exemple |
| --- | --- | --- |
| `AT…` | **L'adaptateur** — n'atteint jamais le véhicule | `ATE0` (écho off) |
| Hexadécimal | **Le calculateur** — passe sur le bus | `010C` (régime moteur) |

C'est une distinction importante : `ATZ` réinitialise le *dongle*, pas la voiture.

---

## 2. Dialogue série

Une commande se termine par un retour chariot `\r`. La réponse se termine par le prompt `>`.

```
→ 010C\r
← 41 0C 1A F8\r\r>
```

`Elm327Client` détecte ce `>` pour savoir qu'une réponse est complète. Tant qu'il n'est pas reçu,
aucune nouvelle commande n'est émise.

### Séquence d'initialisation utilisée

| Commande | Effet |
| --- | --- |
| `ATZ` | Réinitialise l'adaptateur (retourne sa version) |
| `ATE0` | Désactive l'écho — sinon chaque commande est renvoyée dans la réponse |
| `ATL0` | Supprime les sauts de ligne superflus |
| `ATS0` | Supprime les espaces entre octets (réponses plus compactes) |
| `ATH0` | Masque les en-têtes CAN |
| `ATAT1` | Temporisation adaptative (réduit la latence) |
| `ATSP0` | Détection automatique du protocole du véhicule |
| `0100` | Première requête réelle : confirme que le calculateur répond |

### Réponses d'erreur courantes

| Réponse | Signification |
| --- | --- |
| `NO DATA` | Le calculateur n'a pas répondu — PID non supporté, ou contact coupé |
| `UNABLE TO CONNECT` | Aucun protocole détecté — vérifier le contact et la prise |
| `SEARCHING...` | Détection de protocole en cours (bruit, ignoré par l'analyseur) |
| `BUS INIT: ERROR` | Échec d'initialisation du bus |
| `CAN ERROR` | Erreur du contrôleur CAN de l'adaptateur |
| `STOPPED` | Requête interrompue |
| `?` | Commande non comprise par l'adaptateur |
| `7F 01 12` | Réponse **négative** du calculateur (service 01, code 0x12 = sous-fonction non supportée) |

---

## 3. Pièges de parsing (tous couverts par les tests)

### 3.1 En-tête CAN 11 bits — désalignement d'un demi-octet

Avec `ATH1`, une réponse commence par l'identifiant CAN sur **3 caractères hexadécimaux** :

```
7E8 03 41 0D 5A
```

`7E8` n'est pas aligné sur un octet. Concaténé naïvement aux données, il décale tout le décodage.
`stripCanHeader()` retire cet en-tête, y compris dans sa forme collée (`ATH1` + `ATS0`) où la ligne
devient simplement de longueur impaire.

### 3.2 Réponses multi-trames (ISO-TP)

Une réponse de plus de 7 octets est découpée. L'ELM327 l'affiche sous forme indexée :

```
014                    ← longueur totale (0x14 = 20 octets)
0:490201564631
1:52464130303536
2:37313233343536
```

`joinFrames()` retire la ligne de longueur, les préfixes `N:`, puis concatène.

### 3.3 Octet de comptage des DTC

Sur CAN, la réponse du mode 03 contient le nombre de codes avant les codes eux-mêmes :

```
43 02 03 01 04 20
   ^^ 2 codes
```

Les codes allant par paires d'octets, une charge utile de **longueur impaire** signale la présence
de cet octet de comptage — c'est l'heuristique utilisée par `ObdSession.readDtcs()`.

### 3.4 Réponses de plusieurs calculateurs

Sans filtre d'adresse, plusieurs ECU peuvent répondre à la même requête. L'analyseur retient la
première ligne exploitable pour rester déterministe.

---

## 4. Mode 01 — données temps réel

Requête : `01` + numéro de PID. Réponse : `41` + PID + données.

### Découverte des PID supportés

Les PID `0x00`, `0x20`, `0x40`, `0x60`… retournent un bitmask de 4 octets décrivant les 32 PID
suivants. Le bit de poids fort du premier octet correspond au PID `base + 1` ; le bit de poids
faible du dernier octet indique si le bloc suivant existe.

### Formules implémentées

`A`, `B` désignent le premier et le deuxième octet de données.

| PID | Paramètre | Formule | Unité |
| --- | --- | --- | --- |
| `01` | Statut moniteurs | bit 7 de A = témoin moteur ; bits 0–6 = nombre de DTC | — |
| `03` | Statut système carburant | énumération | — |
| `04` | Charge moteur | `A × 100 / 255` | % |
| `05` | Température liquide | `A − 40` | °C |
| `06` / `07` | Trim carburant court / long terme B1 | `A × 100 / 128 − 100` | % |
| `0A` | Pression carburant | `A × 3` | kPa |
| `0B` | Pression collecteur | `A` | kPa |
| `0C` | **Régime moteur** | `(256A + B) / 4` | tr/min |
| `0D` | **Vitesse** | `A` | km/h |
| `0E` | Avance allumage | `A / 2 − 64` | ° |
| `0F` | Température air admission | `A − 40` | °C |
| `10` | Débit d'air (MAF) | `(256A + B) / 100` | g/s |
| `11` | Position papillon | `A × 100 / 255` | % |
| `1F` | Temps depuis démarrage | `256A + B` | s |
| `21` | Distance témoin allumé | `256A + B` | km |
| `2F` | Niveau carburant | `A × 100 / 255` | % |
| `31` | Distance depuis effacement | `256A + B` | km |
| `33` | Pression atmosphérique | `A` | kPa |
| `42` | Tension calculateur | `(256A + B) / 1000` | V |
| `43` | Charge absolue | `(256A + B) × 100 / 255` | % |
| `44` | Richesse commandée | `(256A + B) / 32768` | λ |
| `45` | Papillon relatif | `A × 100 / 255` | % |
| `46` | Température air ambiant | `A − 40` | °C |
| `5C` | Température huile | `A − 40` | °C |
| `5E` | Consommation instantanée | `(256A + B) / 20` | L/h |

Le décalage de −40 sur les températures permet de coder des valeurs négatives sur un octet non
signé. Le `−100` des trims recentre une plage 0–255 autour de zéro.

---

## 5. Modes 03 / 07 / 0A — codes défauts

| Mode | Type | Sens |
| --- | --- | --- |
| `03` | Confirmés | Défaut validé sur plusieurs cycles — allume le témoin moteur |
| `07` | En attente | Détecté sur un seul cycle — à surveiller |
| `0A` | Permanents | Ne peuvent être effacés que par le calculateur, après validation des moniteurs |

### Structure d'un code sur 2 octets

```
Octet A                Octet B
┌──┬──┬────┬────┐      ┌────┬────┐
│S1│S0│ D1 │ D2 │      │ D3 │ D4 │
└──┴──┴────┴────┘      └────┴────┘
 └──┬──┘
    └─ 00=P (moteur/transmission)  01=C (châssis)
       10=B (carrosserie)          11=U (réseau)
```

- `D1` (2 bits) : `0` = code générique SAE, sinon spécifique constructeur ;
- `D2`, `D3`, `D4` : quartets hexadécimaux.

Exemple : `0x03 0x01` → `P0301` (ratés de combustion cylindre 1).
`0x0000` signale un emplacement vide et est ignoré.

---

## 6. Mode 09 — informations véhicule

| PID | Contenu |
| --- | --- |
| `02` | VIN (17 caractères ASCII) |
| `04` | Identifiant de calibration |
| `0A` | Nom du calculateur |

La charge utile commence par un octet indiquant le nombre de messages ; les octets suivants sont
de l'ASCII. `bytesToAscii()` filtre les caractères non imprimables (bourrage `0x00`).

---

## 7. Pour aller plus loin

- SAE J1979 / ISO 15031-5 — modes et PID de diagnostic
- ISO 15765-4 — diagnostic sur CAN (ISO-TP)
- ISO 14229 (UDS) — services étendus, **hors périmètre volontaire de ce projet**
- Fiche technique ELM327 (Elm Electronics) — jeu de commandes AT complet
