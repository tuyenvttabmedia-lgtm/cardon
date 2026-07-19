#!/bin/sh
set -e
pg_dump -U postgres -d cardon --no-owner --no-acl | gzip > /tmp/audit_bak.sql.gz
psql -U postgres -d postgres -c 'DROP DATABASE IF EXISTS cardon_restore_test;'
psql -U postgres -d postgres -c 'CREATE DATABASE cardon_restore_test;'
gunzip -c /tmp/audit_bak.sql.gz | psql -U postgres -d cardon_restore_test --single-transaction -q
TABLE_COUNT=$(psql -U postgres -d cardon_restore_test -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';")
psql -U postgres -d postgres -c 'DROP DATABASE cardon_restore_test;'
rm -f /tmp/audit_bak.sql.gz
echo "RESTORE_TABLE_COUNT=${TABLE_COUNT}"
if [ "${TABLE_COUNT}" -lt 5 ]; then
  exit 1
fi
