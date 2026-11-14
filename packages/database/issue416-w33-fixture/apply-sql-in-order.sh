#!/bin/sh
# Disposable W33 fixture only: smoke-apply source SQL, not Prisma checksum history.
set -eu
for directory in /tmp/w33-migrations/*; do
  file="$directory/migration.sql"
  if [ ! -f "$file" ]; then
    continue
  fi
  echo "APPLY $(basename "$directory")"
  if ! psql -U issue416_w33_migration -d issue416_w33_db \
      -X -v ON_ERROR_STOP=1 -f "$file" >/tmp/w33-sql-output.log 2>&1; then
    cat /tmp/w33-sql-output.log
    exit 1
  fi
done
echo "ALL_SQL_APPLIED"
