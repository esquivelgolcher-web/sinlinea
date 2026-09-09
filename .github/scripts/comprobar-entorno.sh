#!/usr/bin/env bash
# Comprueba, en un job con `environment: cuenta-<id>`, que IG_ACCESS_TOKEN e IG_USER_ID vienen del Environment de la
# cuenta y no del repositorio. GitHub aplica el secreto de repositorio del mismo nombre cuando el entorno no lo define;
# aquí eso se rechaza: en modo Environment no se usan credenciales de otro origen.
# Entradas (variables de entorno): CUENTA, ENTORNO, IG_ACCESS_TOKEN, IG_USER_ID, HUELLA_REPO_TOKEN (sha256 del secreto
# de repositorio IG_ACCESS_TOKEN, calculado en un job sin entorno). Nunca imprime valores.
set -euo pipefail

huella() { printf '%s' "$1" | sha256sum | cut -d' ' -f1; }

faltan=""
[ -z "${IG_ACCESS_TOKEN:-}" ] && faltan="$faltan IG_ACCESS_TOKEN"
[ -z "${IG_USER_ID:-}" ] && faltan="$faltan IG_USER_ID"
if [ -n "$faltan" ]; then
  echo "::error::Cuenta ${CUENTA:-?} (Environment ${ENTORNO:-?}): faltan los secretos$faltan en el entorno. No se usan credenciales de otro origen. Añádelos en Settings → Environments → ${ENTORNO:-?} → Environment secrets."
  exit 1
fi

if [ -n "${HUELLA_REPO_TOKEN:-}" ] && [ "$(huella "$IG_ACCESS_TOKEN")" = "$HUELLA_REPO_TOKEN" ]; then
  echo "::error::Cuenta ${CUENTA:-?} (Environment ${ENTORNO:-?}): IG_ACCESS_TOKEN no está definido en el entorno (o tiene el mismo valor que el secreto de repositorio IG_ACCESS_TOKEN). GitHub aplicó el secreto del repositorio y no se acepta como origen. Añade a ${ENTORNO:-?} un IG_ACCESS_TOKEN propio."
  exit 1
fi

echo "Cuenta ${CUENTA:-?}: credenciales del Environment ${ENTORNO:-?} (IG_ACCESS_TOKEN, IG_USER_ID)."
