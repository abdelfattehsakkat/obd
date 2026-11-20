# Matériel et connexion

## 1. Choisir le mode de connexion de votre dongle

Beaucoup d'adaptateurs ELM327 annoncent **Bluetooth classique ET Bluetooth LE** — l'application
mobile que vous utilisez déjà propose probablement les deux dans ses réglages. Ce choix détermine
l'architecture côté PC :

| Mode du dongle | Accessible depuis un navigateur ? | Ce qu'il faut faire |
| --- | --- | --- |
| **Bluetooth LE (4.0+)** | ✅ Oui, via l'API Web Bluetooth | Rien — choisir « Bluetooth LE » dans OBD Scope |
| **Bluetooth classique (SPP/RFCOMM)** | ❌ Non, aucun navigateur ne l'expose | Lancer la passerelle `npm run bridge` |
| **USB** | ❌ Pas en série | Passerelle également |
| **Wi-Fi** | Partiellement | Non implémenté (voir feuille de route) |

> **Basculez d'abord votre adaptateur en Bluetooth LE dans son application de configuration** et
> vérifiez que la lecture fonctionne toujours. Certains clones bon marché annoncent le BLE mais
> ont un firmware instable dans ce mode : si c'est le cas, restez en Bluetooth classique et
> utilisez la passerelle.

---

## 2. Connexion Bluetooth LE

### Prérequis

- Chrome ou Edge (desktop ou Android). **Safari et Firefox ne supportent pas Web Bluetooth.**
- Page servie en `https://` ou sur `localhost` / `127.0.0.1` — c'est le cas du serveur de dev.
- Adaptateur en mode BLE, non connecté à une autre application.

### Procédure

1. Contact mis (moteur arrêté pour la première connexion), dongle branché sur la prise OBD.
2. `npm run dev`, ouvrir <http://127.0.0.1:5173>.
3. Sélectionner **« Bluetooth LE »**, cliquer sur **Connecter**.
4. Le navigateur affiche la liste des périphériques BLE : choisir le dongle (souvent nommé
   `OBDII`, `OBD-BLE`, `Vgate`, `V-LINK`…).

### Profils GATT reconnus

Le tunnel série sur BLE n'est **pas normalisé** : chaque fabricant expose son propre service.
`BleTransport` essaie les profils connus dans l'ordre, puis bascule sur une détection automatique
(recherche d'une caractéristique en écriture et d'une en notification).

| Profil | Service | Écriture | Notification |
| --- | --- | --- | --- |
| Vgate / clones ELM327 | `FFF0` | `FFF2` | `FFF1` |
| Module HM-10 / CC254x | `FFE0` | `FFE1` | `FFE1` |
| LELink / Konnwei | `18F0` | `2AF1` | `2AF0` |
| Nordic UART Service | `6E400001-…` | `6E400002-…` | `6E400003-…` |
| Variante deux caractéristiques | `FFE0` | `FFE2` | `FFE1` |
| JDY-08 / CH9141 | `FFE5` | `FFE9` | `FFE4` |
| Variante FFF0 inversée | `FFF0` | `FFF1` | `FFF2` |

Si le dongle n'utilise aucun de ces profils, une **détection automatique** prend le relais : elle
retient le premier service exposant à la fois une caractéristique inscriptible et une
caractéristique notifiable.

> **Piège Web Bluetooth.** Avec `acceptAllDevices`, `getPrimaryServices()` ne renvoie que les
> services déclarés dans `optionalServices`. La détection automatique est donc aveugle à tout
> service non déclaré. C'est pourquoi `OPTIONAL_SERVICES` déclare l'intégralité des plages
> `FFE0-FFEF`, `FFF0-FFFF`, `18F0-18FF` et `FD00-FD0F`, où se rangent en pratique les modules
> « série sur BLE ».

### Si aucun profil ne correspond

L'application affiche *« Aucun service série BLE compatible trouvé »* **suivi de la liste des
services explorés** et des propriétés de chaque caractéristique (`R` lecture, `W` écriture,
`w` écriture sans réponse, `N` notification, `I` indication). Cette liste suffit généralement à
identifier le bon couple.

#### Relever les UUID depuis le Mac (recommandé)

Pas besoin d'un téléphone : Chrome embarque un explorateur GATT.

1. Ouvrir `chrome://bluetooth-internals` → onglet **Devices** → **Start Scan**.
2. Cliquer sur le dongle, puis **Inspect**.
3. Déplier les services : noter l'UUID du service custom, celui de la caractéristique **WRITE**
   (ou *Write Without Response*) et celui avec **NOTIFY**.

#### Depuis un téléphone

**nRF Connect for Mobile** fait le même travail. Si le dongle n'apparaît pas au scan, voir la
section dépannage ci-dessous : dans la quasi-totalité des cas il est encore connecté à une autre
application et a donc cessé d'émettre.

#### Ajouter le profil

Ajouter une entrée dans `KNOWN_BLE_PROFILES`
([`src/transport/BleTransport.ts`](../src/transport/BleTransport.ts)) :

```ts
{
  name: 'Mon dongle',
  service: '0000abcd-0000-1000-8000-00805f9b34fb',
  write:   '0000abce-0000-1000-8000-00805f9b34fb',
  notify:  '0000abcf-0000-1000-8000-00805f9b34fb',
},
```

Les UUID courts (`FFE0`) s'écrivent en forme longue : `0000FFE0-0000-1000-8000-00805F9B34FB`.

---

## 3. Connexion via la passerelle série (Bluetooth classique / USB)

### Pourquoi une passerelle

Le profil SPP (port série sur Bluetooth) n'est accessible à aucun navigateur, pour des raisons de
sécurité du modèle web. La passerelle Node ouvre le port série côté système et le relaie en
WebSocket local.

### macOS / Linux

```bash
# 1. Appairer l'adaptateur dans les réglages Bluetooth du système
#    (code PIN habituel : 1234 ou 0000)

# 2. Repérer le port série créé
npm run bridge -- --list

# 3. Lancer la passerelle
npm run bridge -- --port /dev/cu.OBDII
```

Sans `--port`, la passerelle tente une auto-détection.

Le port ressemble à `/dev/cu.OBDII`, `/dev/cu.Bluetooth-Serial` (macOS) ou `/dev/rfcomm0`,
`/dev/ttyUSB0` (Linux). Sur Linux, il peut être nécessaire d'appartenir au groupe `dialout` :

```bash
sudo usermod -aG dialout $USER   # puis se reconnecter
```

### Windows

Le listage automatique des ports `COM` n'est pas implémenté. Deux options :

- utiliser le **mode Bluetooth LE**, plus simple sur Windows ;
- ou adapter le bridge avec le paquet `serialport` (voir la feuille de route).

### Dans l'application

Sélectionner **« Bridge série »**, vérifier l'URL (`ws://127.0.0.1:8787`), puis **Connecter**.

---

## 4. Dépannage

| Symptôme | Cause probable | Solution |
| --- | --- | --- |
| Le navigateur ne liste aucun périphérique BLE | Dongle en Bluetooth classique, ou déjà connecté au téléphone | Basculer en mode BLE, fermer l'app mobile, couper le Bluetooth du téléphone |
| « Web Bluetooth n'est pas disponible » | Safari / Firefox, ou page non sécurisée | Utiliser Chrome ou Edge sur `localhost` ou en HTTPS |
| « Aucun service série BLE compatible trouvé » | Profil GATT propriétaire | Lire la liste des services affichée dans le message, ou relever les UUID via `chrome://bluetooth-internals` (§ 2) |
| Le dongle n'apparaît dans aucun scanner (nRF Connect, sélecteur Chrome) | Un périphérique BLE **cesse d'émettre dès qu'il est connecté** : une autre application le détient | Fermer complètement l'application concurrente (Car Scanner…), puis débrancher et rebrancher le dongle |
| Le dongle n'apparaît pas au scan sur Android | Le scan BLE exige l'autorisation de localisation | Activer Localisation + autorisation pour l'application de scan |
| Le dongle est visible dans les réglages Bluetooth mais pas au scan BLE | Il est appairé en Bluetooth **classique** ; les scanners BLE n'affichent que les annonces BLE | Basculer le dongle en mode BLE, ou utiliser la passerelle (§ 3) |
| « Le calculateur ne répond pas » | Contact coupé | Mettre le contact (position 2), moteur à l'arrêt suffit |
| `UNABLE TO CONNECT` en boucle | Protocole non détecté, dongle mal enfoncé | Rebrancher le dongle, réessayer ; forcer un protocole avec `ATSP6` depuis la console |
| Beaucoup de `NO DATA` | PID non supportés par le véhicule | Normal — l'application les retire automatiquement de l'acquisition |
| Valeurs figées ou incohérentes | Clone ELM327 de mauvaise qualité | Réduire le nombre de capteurs en acquisition ; envisager un adaptateur de meilleure facture (puce STN) |
| Déconnexions fréquentes en BLE | Portée / interférences, firmware instable | Rester près du dongle ; basculer sur la passerelle en Bluetooth classique |
| « Bridge injoignable » | Passerelle non démarrée | `npm run bridge` dans un second terminal |
| Batterie qui se décharge | Dongle laissé branché | **Débrancher l'adaptateur après usage** — voir la note ci-dessous |

---

## 5. Bonnes pratiques

- **Débranchez le dongle après usage.** Un adaptateur bas de gamme laissé en permanence peut
  empêcher certains calculateurs de passer en veille et vider la batterie en quelques jours.
- Faites la première connexion **contact mis, moteur arrêté**.
- Ne manipulez jamais l'interface en conduisant.
- Un seul logiciel à la fois peut dialoguer avec l'adaptateur : fermez l'application mobile avant
  de vous connecter depuis le PC.
