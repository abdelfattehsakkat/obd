# Sécurité — le modèle « lecture seule »

Ce document répond à la question centrale du projet : **peut-on abîmer une voiture en lisant mal
ses données ?** Puis il détaille les protections mises en place.

---

## 1. Réponse courte

**Non.** Les requêtes de lecture OBD-II normalisées (SAE J1979) ne modifient pas l'état du
calculateur. Une requête malformée produit au pire une réponse d'erreur (`NO DATA`, réponse
négative `7F`) ou aucune réponse. Le protocole est conçu pour cela : c'est un protocole
d'interrogation, pas de commande.

Le risque n'existe que si l'on envoie des commandes **d'écriture ou de contrôle**. C'est
précisément ce que cette application rend impossible.

---

## 2. Ce qui est dangereux, et pourquoi

| Commande | Nature | Risque réel |
| --- | --- | --- |
| **Mode 04** — Clear diagnostic information | Écriture mémoire ECU | Efface les codes défauts **et les données figées** (freeze frame). Perte définitive du contexte de la panne. Remet les moniteurs d'émissions à « non prêts » : le véhicule échoue au contrôle technique tant qu'un cycle de conduite complet n'a pas été effectué. |
| **Mode 08** — Control on-board system | Pilotage d'actionneur | Force le fonctionnement d'un composant (vanne EVAP, etc.) hors de son contexte normal. |
| **UDS 0x2E** — WriteDataByIdentifier | Écriture de paramètre | Modifie une valeur de configuration du calculateur. |
| **UDS 0x2F** — InputOutputControl | Forçage d'entrée/sortie | Test d'actionneur : injecteurs, ventilateurs, relais. Sur un moteur tournant, potentiellement destructeur. |
| **UDS 0x31** — RoutineControl | Routine constructeur | Déclenche des procédures (régénération FAP forcée, apprentissages, purges). |
| **UDS 0x34–0x37** — Download / TransferData | Reprogrammation | Flash du firmware. Une interruption laisse un calculateur inutilisable (« brické »). |
| **UDS 0x11** — ECUReset | Redémarrage ECU | Redémarre un calculateur, éventuellement pendant que le moteur tourne. |
| **UDS 0x85** — ControlDTCSetting | Inhibition de détection | Désactive l'enregistrement des défauts. |
| **UDS 0x27** — SecurityAccess | Déverrouillage | Ouvre l'accès aux fonctions d'écriture ci-dessus. |
| **AT SH / AT SD / AT FC** (ELM327) | Trames forgées | Permet d'émettre n'importe quelle trame arbitraire sur le bus CAN, donc de contourner toutes les protections ci-dessus. |

---

## 3. Ce que fait l'application — et rien d'autre

Modes autorisés, tous en lecture pure :

| Mode | Rôle |
| --- | --- |
| `01` | Données temps réel (régime, vitesse, températures…) |
| `02` | Données figées associées à un code défaut |
| `03` | Codes défauts confirmés |
| `06` | Résultats des tests des moniteurs embarqués |
| `07` | Codes défauts en attente |
| `09` | Informations véhicule (VIN, calibration, nom du calculateur) |
| `0A` | Codes défauts permanents |

Ces modes sont définis par la norme comme des requêtes d'interrogation. Le calculateur y répond
sans transition d'état.

**L'effacement des codes défauts n'est volontairement pas implémenté** — ni dans l'interface, ni
dans le code. Ce n'est pas une case à décocher : la commande est structurellement absente et
activement bloquée.

---

## 4. Comment le blocage est mis en œuvre

### 4.1 Point de passage unique

Toute commande destinée à l'adaptateur transite obligatoirement par
[`src/obd/readOnlyGuard.ts`](../src/obd/readOnlyGuard.ts), appelé depuis
[`Elm327Client.send()`](../src/core/Elm327Client.ts). Le transport
(`BleTransport`, `BridgeTransport`, `DemoTransport`) n'est jamais sollicité directement.

Le garde-fou est évalué **avant la mise en file d'attente** : une commande interdite n'atteint
jamais la couche matérielle.

### 4.2 Liste blanche, pas liste noire

Le principe retenu est **« tout est interdit sauf… »** :

- modes OBD : seuls `01, 02, 03, 06, 07, 09, 0A` passent ; tout autre octet de mode est rejeté,
  y compris les modes inconnus ou constructeur ;
- commandes AT : seules ~20 commandes de configuration de l'adaptateur sont acceptées, via des
  expressions régulières ancrées (`^…$`) ;
- les commandes `ST` (jeu étendu des puces STN/OBDLink) sont refusées en bloc, faute d'audit.

Une liste noire seule serait contournable par une commande non anticipée. La liste blanche
échoue en sécurité.

### 4.3 Validation syntaxique

Avant même l'examen du mode, une trame doit être hexadécimale et de longueur paire. Une saisie
tronquée est rejetée plutôt que transmise partiellement.

### 4.4 Défense en profondeur côté bridge

La passerelle Node ([`scripts/bridge/server.mjs`](../scripts/bridge/server.mjs)) rejoue
intégralement le garde-fou côté serveur. Elle ne fait pas confiance au client, même s'il s'agit de
notre propre interface. Un test de parité
([`tests/bridgeGuard.test.ts`](../tests/bridgeGuard.test.ts)) garantit que les deux
implémentations ne divergent jamais sur un corpus de 64 commandes.

### 4.5 Durcissement du bridge

Le bridge ouvre un port série sur la machine : c'est une surface d'attaque à part entière.

- écoute uniquement sur `127.0.0.1`, jamais sur une interface réseau ;
- vérification de l'en-tête `Origin` (protection contre le *cross-site WebSocket hijacking* : sans
  cela, n'importe quel site ouvert dans le navigateur pourrait piloter le port série) ;
- une seule session cliente simultanée ;
- longueur maximale de commande, pour éviter de saturer le tampon de l'adaptateur.

### 4.6 Retour visuel

La console affiche en direct le verdict du garde-fou (`Lecture` / `Bloqué`) et désactive le bouton
d'envoi pour toute commande refusée, avec la raison explicite du refus.

---

## 5. Couverture de test

`npm test` exécute notamment :

- **`tests/readOnlyGuard.test.ts`** — vérifie que le mode 04, le mode 08, les services UDS
  d'écriture, les modes inconnus et les commandes AT dangereuses sont tous refusés ;
- **`tests/session.test.ts`** — vérifie qu'une tentative d'envoi de `04`, `2E0100` ou `ATSH7E0`
  depuis la console est rejetée, et que la file de commandes n'est pas bloquée par ce refus ;
- **`tests/bridgeGuard.test.ts`** — parité client / serveur ;
- **`tests/ui.test.tsx`** — vérifie que l'interface désactive effectivement l'envoi.

---

## 6. Ce que le logiciel ne peut pas protéger

Ces points relèvent de l'usage, pas du code :

1. **Le dongle lui-même.** Un adaptateur bas de gamme peut se comporter de façon erratique sur le
   bus. Un clone ELM327 de mauvaise qualité laissé branché en permanence peut empêcher certains
   calculateurs de passer en veille et **décharger la batterie**. Débranchez-le après usage.
2. **Le contact.** Effectuez la première connexion contact mis, moteur arrêté.
3. **La conduite.** Ne manipulez pas l'interface en roulant. Faites-vous accompagner si vous
   voulez observer des données en mouvement.
4. **L'interprétation.** Une valeur lue correctement peut être mal interprétée. Un code défaut
   n'indique pas la pièce à remplacer, mais le symptôme constaté par le calculateur.
5. **Les véhicules hybrides / électriques et certains bus multiplexés sensibles.** Le
   comportement reste une lecture, mais soyez d'autant plus attentif à la qualité du dongle.

---

## 7. Si vous modifiez le code

Les règles suivantes sont non négociables pour conserver la garantie de lecture seule :

- ne jamais ajouter de mode au `Set` `ALLOWED_OBD_MODES` sans analyse écrite du risque ;
- ne jamais appeler `transport.write()` directement : passer par `Elm327Client.send()` ;
- ne jamais ajouter de motif AT permettant de définir un en-tête ou des données arbitraires
  (`ATSH`, `ATSD`, `ATFC`, `ATCP`…) ;
- toute modification du garde-fou doit être répercutée dans le miroir du bridge et les tests de
  parité doivent rester verts.
