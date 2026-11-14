#!/bin/sh
# Isolated W27 Docker fixture only. Exercises SQL parsing/execution, not
# Prisma migration history/checksums or permission to repair other fixtures.
set -eu
for directory in /tmp/w27-migrations/*; do
  file="$directory/migration.sql"
  if [ ! -f "$file" ]; then
    continue
  fi
  echo "APPLY $(basename "$directory")"
  if ! psql -U issue416_w27_migration -d issue416_w27_db \
    -X -v ON_ERROR_STOP=1 -f "$file" >/tmp/w27-sql-output.log 2>&1; then
    cat /tmp/w27-sql-output.log
    exit 1
  fi
done
echo "ALL_SQL_APPLIED"
