# CardOn — Backup & Restore Plan

> Phase 4D — operational backup procedures.

## PostgreSQL

### Daily backup

```bash
# Encrypted dump (run via cron at 02:00 UTC)
pg_dump "$DATABASE_URL" --format=custom --file="/backups/cardon-$(date +%Y%m%d).dump"
gpg --symmetric --cipher-algo AES256 "/backups/cardon-$(date +%Y%m%d).dump"
```

Retention: **30 days** daily, **12 months** monthly archive.

### Restore test (monthly)

```bash
# 1. Create isolated test DB
createdb cardon_restore_test

# 2. Restore latest dump
pg_restore --dbname=cardon_restore_test --clean --if-exists /backups/cardon-latest.dump

# 3. Verify row counts
psql cardon_restore_test -c "SELECT COUNT(*) FROM orders;"
psql cardon_restore_test -c "SELECT COUNT(*) FROM payments WHERE status = 'SUCCESS';"

# 4. Drop test DB after verification
dropdb cardon_restore_test
```

Document restore test date and result in ops log.

## Redis

- Enable AOF: `redis-server --appendonly yes`
- RDB snapshot daily (queue state is recoverable; jobs may be re-enqueued)
- **Not a source of truth** — PostgreSQL holds financial data

## Environment variables

| Method | Frequency |
|--------|-----------|
| Encrypted secrets manager (Vault / AWS SM) | Source of truth |
| `.env.production` export to encrypted archive | On every secret rotation |
| Never commit `.env` to git | Always |

Restore procedure: redeploy `.env.production` from secrets manager before starting API/worker.

## Connection pool (production)

Add to `DATABASE_URL`:

```
postgresql://user:pass@host:5432/cardon?schema=public&connection_limit=20&pool_timeout=30
```

Tune `connection_limit` per API replica × worker count.

## Related

- [DATA_RETENTION_RULES.md](./DATA_RETENTION_RULES.md)
- [PHASE_4D_PRODUCTION_READINESS_REPORT.md](./PHASE_4D_PRODUCTION_READINESS_REPORT.md)
