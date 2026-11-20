#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

if [[ ! -x node_modules/.bin/vite ]]; then
  printf 'Dépendances manquantes. Lancez npm ci à la racine du projet.\n' >&2
  exit 1
fi

exec npm run dev -- --host 127.0.0.1