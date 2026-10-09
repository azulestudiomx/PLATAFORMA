#!/usr/bin/env bash
#
# dev-local.sh — levanta el entorno completo de desarrollo.
#
#   ./dev-local.sh          arranca PostgreSQL, backend y frontend
#   ./dev-local.sh stop     detiene backend y frontend
#   ./dev-local.sh status   muestra qué está corriendo
#   ./dev-local.sh logs     sigue los registros de ambos servicios
#
set -uo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PGDATA="/opt/homebrew/var/postgresql@16"
PGBIN="/opt/homebrew/opt/postgresql@16/bin"
LOGS="$RAIZ/.dev-logs"
BD="plataforma_campeche"

mkdir -p "$LOGS"

# PostgreSQL en macOS aborta al arrancar si LC_ALL no trae un locale válido.
export LC_ALL=C

verde()  { printf '\033[0;32m%s\033[0m\n' "$1"; }
rojo()   { printf '\033[0;31m%s\033[0m\n' "$1"; }
gris()   { printf '\033[0;90m%s\033[0m\n' "$1"; }

arranca_postgres() {
  if "$PGBIN/pg_isready" -q 2>/dev/null; then
    verde "✓ PostgreSQL ya estaba corriendo"
    return 0
  fi

  # Un postmaster.pid huérfano (por un apagón o un reinicio) impide arrancar
  # aunque no haya ningún proceso vivo. Se aparta solo si nadie usa el puerto.
  if [ -f "$PGDATA/postmaster.pid" ] && ! lsof -nP -iTCP:5432 -sTCP:LISTEN >/dev/null 2>&1; then
    gris "  · apartando lock huérfano de un arranque anterior"
    mv "$PGDATA/postmaster.pid" "/tmp/postmaster.pid.$(date +%s).bak"
  fi

  "$PGBIN/pg_ctl" -D "$PGDATA" -l "$LOGS/postgres.log" start >/dev/null 2>&1
  for _ in $(seq 1 20); do
    "$PGBIN/pg_isready" -q 2>/dev/null && { verde "✓ PostgreSQL arriba"; return 0; }
    sleep 0.5
  done

  rojo "✗ PostgreSQL no arrancó. Revisa $LOGS/postgres.log"
  return 1
}

arranca_backend() {
  pkill -f "node index.js" 2>/dev/null
  sleep 1
  ( cd "$RAIZ/server" && node index.js > "$LOGS/backend.log" 2>&1 & )

  for _ in $(seq 1 24); do
    if curl -sf -m 2 http://localhost:3003/api/health >/dev/null 2>&1; then
      verde "✓ Backend arriba      → http://localhost:3003"
      return 0
    fi
    sleep 0.5
  done

  rojo "✗ El backend no respondió. Últimas líneas del registro:"
  tail -20 "$LOGS/backend.log"
  return 1
}

# Vite salta al siguiente puerto libre si el 3000 está tomado (Docker suele
# ocuparlo), así que el puerto real se lee del propio registro de arranque.
puerto_frontend() {
  grep -o 'localhost:[0-9]\{4,5\}' "$LOGS/frontend.log" 2>/dev/null | head -1 | cut -d: -f2
}

arranca_frontend() {
  pkill -f "vite" 2>/dev/null
  sleep 1
  : > "$LOGS/frontend.log"
  ( cd "$RAIZ" && npx vite > "$LOGS/frontend.log" 2>&1 & )

  for _ in $(seq 1 40); do
    PUERTO="$(puerto_frontend)"
    if [ -n "$PUERTO" ] && curl -sf -m 2 "http://localhost:$PUERTO" >/dev/null 2>&1; then
      verde "✓ Frontend arriba     → http://localhost:$PUERTO"
      [ "$PUERTO" != "3000" ] && gris "  (el 3000 estaba ocupado; Vite tomó el siguiente libre)"
      return 0
    fi
    sleep 0.5
  done

  rojo "✗ El frontend no respondió. Últimas líneas del registro:"
  tail -20 "$LOGS/frontend.log"
  return 1
}

case "${1:-start}" in
  stop)
    pkill -f "node index.js" 2>/dev/null && verde "✓ Backend detenido"  || gris "· backend no estaba corriendo"
    pkill -f "vite"          2>/dev/null && verde "✓ Frontend detenido" || gris "· frontend no estaba corriendo"
    gris "  PostgreSQL sigue arriba (otros proyectos podrían usarlo)."
    gris "  Para detenerlo: $PGBIN/pg_ctl -D $PGDATA stop"
    ;;

  status)
    "$PGBIN/pg_isready" -q 2>/dev/null && verde "✓ PostgreSQL" || rojo "✗ PostgreSQL"
    curl -sf -m 2 http://localhost:3003/api/health >/dev/null 2>&1 && verde "✓ Backend  (3003)" || rojo "✗ Backend  (3003)"
    PUERTO="$(grep -o 'localhost:[0-9]\{4,5\}' "$LOGS/frontend.log" 2>/dev/null | head -1 | cut -d: -f2)"
    if [ -n "$PUERTO" ] && curl -sf -m 2 "http://localhost:$PUERTO" >/dev/null 2>&1; then
      verde "✓ Frontend ($PUERTO)"
    else
      rojo "✗ Frontend"
    fi
    echo
    psql -d "$BD" -t -c "
      SELECT '  personas:    ' || COUNT(*) FROM \"Person\"
      UNION ALL SELECT '  territorios: ' || COUNT(*) FROM \"Territory\"
      UNION ALL SELECT '  usuarios:    ' || COUNT(*) FROM \"User\"
      UNION ALL SELECT '  expedientes: ' || COUNT(*) FROM \"Report\";" 2>/dev/null
    ;;

  logs)
    tail -f "$LOGS/backend.log" "$LOGS/frontend.log"
    ;;

  start|*)
    echo
    gris "── Plataforma Ciudadana Campeche · entorno local ──"
    arranca_postgres || exit 1
    arranca_backend  || exit 1
    arranca_frontend || exit 1
    echo
    verde "Todo listo. Abre → http://localhost:$(puerto_frontend)"
    gris  "Registros: ./dev-local.sh logs   ·   Detener: ./dev-local.sh stop"
    echo
    ;;
esac
