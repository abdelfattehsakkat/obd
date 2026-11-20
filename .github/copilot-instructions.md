# Instructions Copilot — OBD Scope

Le contexte complet du dépôt se trouve dans [AGENTS.md](../AGENTS.md). Lisez-le avant toute
modification. Résumé des points critiques :

- **Outil de diagnostic automobile strictement en lecture seule.** Ne jamais ajouter le mode OBD
  04 (effacement des codes défauts), le mode 08, un service UDS d'écriture, ni une commande AT
  permettant de forger une trame (`ATSH`, `ATSD`, `ATFC`, `ATPP`…).
- **Toute écriture passe par `Elm327Client.send()`**, qui appelle `assertReadOnly()`. Ne jamais
  appeler `transport.write()` directement.
- Le garde-fou [`src/obd/readOnlyGuard.ts`](../src/obd/readOnlyGuard.ts) a un **miroir** dans
  [`scripts/bridge/readOnlyGuard.mjs`](../scripts/bridge/readOnlyGuard.mjs) : modifier les deux.
- `src/obd/` reste **pur** (pas de React, pas de DOM, pas d'API navigateur).
- Interface, commentaires et documentation en **français**.
- Après modification : `npm test`, `npx tsc --noEmit` et `npm run build` doivent passer.
  Ne jamais affaiblir un test de sécurité.
- Périmètre volontairement exclu : authentification, comptes, base de données, historique.
