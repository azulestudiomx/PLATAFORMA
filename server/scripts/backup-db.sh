#!/usr/bin/env bash
#
# Respaldo diario de la base de datos SQLite con rotación de 14 días.
#
# Uso manual:   bash server/scripts/backup-db.sh
# Cron (VPS):   0 3 * * * bash /ruta/a/PLATAFORMA/server/scripts/backup-db.sh >> /var/log/plataforma-backup.log 2>&1
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_PATH="${DB_PATH:-$SCRIPT_DIR/../prisma/dev.db}"
BACKUP_DIR="${BACKUP_DIR:-$SCRIPT_DIR/../backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

if [ ! -f "$DB_PATH" ]; then
    echo "ERROR: no existe la base de datos en $DB_PATH"
    echo "Ajusta la variable DB_PATH si tu base está en otra ruta."
    exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
DEST="$BACKUP_DIR/plataforma_$STAMP.db"

# .backup garantiza una copia consistente aunque el servidor esté escribiendo
sqlite3 "$DB_PATH" ".backup '$DEST'"
gzip "$DEST"

echo "OK: respaldo creado en $DEST.gz ($(du -h "$DEST.gz" | cut -f1))"

# Rotación: elimina respaldos con más de RETENTION_DAYS días
find "$BACKUP_DIR" -name 'plataforma_*.db.gz' -mtime +"$RETENTION_DAYS" -delete
echo "Rotación aplicada: se conservan los últimos $RETENTION_DAYS días."
