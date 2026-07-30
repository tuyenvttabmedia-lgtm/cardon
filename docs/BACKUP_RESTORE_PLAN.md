# CardOn — Backup & Restore Plan

> Phase 4D / P0.3 — operational backup procedures (host cron on VPS).

## What runs in production

Installed by `scripts/deploy/install-backup-cron.sh` → `/etc/cron.d/cardon-backup`.

| Schedule (Asia/Ho_Chi_Minh) | Job | Script |
|-----------------------------|-----|--------|
| Daily 02:30 | Postgres dump → `backups/cardon_<db>_YYYYMMDD_HHMMSS.sql.gz` + `..._latest.sql.gz` | `scripts/backup-db.sh` |
| Daily 02:45 | Restore verify into isolated `cardon_restore_test`, then drop | `scripts/verify-backup-restore.sh` |
| Sunday 03:15 | Uploads archive | `scripts/backup-uploads.sh` |

Logs:

- `/var/log/cardon-backup.log`
- `/var/log/cardon-backup-restore.log`
- `backups/RESTORE_VERIFY.log` (PASS/FAIL line per verify)

Retention:

- Daily SQL dumps: **30 days**
- Monthly copies under `backups/monthly/`: **~12 months**
- Uploads archives: **60 days**

## Manual commands (VPS)

```bash
cd /opt/cardon
sudo ./scripts/deploy/install-backup-cron.sh /opt/cardon

# Snapshot now
/bin/bash ./scripts/backup-db.sh

# Prove the latest dump restores (does NOT touch production DB data)
/bin/bash ./scripts/verify-backup-restore.sh

# Destructive restore into production DB (stop api/worker first)
FORCE_RESTORE=1 /bin/bash ./scripts/restore-db.sh backups/cardon_cardon_latest.sql.gz
```

## PostgreSQL dump format

Plain SQL gzip via `pg_dump | gzip` (compatible with `psql` restore). Custom-format dumps from older docs are not used by these scripts.

## Restore test checks

`verify-backup-restore.sh` asserts:

1. Public table count ≥ 5
2. `orders` and `payments` tables exist after restore
3. Counts for `orders` and `payments WHERE status='SUCCESS'` are readable

## Redis

- AOF enabled in `docker-compose.production.yml` (`--appendonly yes`)
- **Not** a source of truth — PostgreSQL holds financial data
- Queue jobs may be re-enqueued after Redis loss

## Environment / secrets

| Method | Frequency |
|--------|-----------|
| Encrypted secrets manager / password vault | Source of truth |
| `.env.production` kept only on VPS (never git) | On every secret rotation |
| Optional encrypted copy of `.env.production` off-box | After rotation |

Restore procedure for app: restore SQL dump → redeploy `.env.production` with the **same** `ENCRYPTION_KEY` / `JWT_SECRET` → start API/worker.

## Related

- [DATA_RETENTION_RULES.md](./DATA_RETENTION_RULES.md)
- [PHASE_4D_PRODUCTION_READINESS_REPORT.md](./PHASE_4D_PRODUCTION_READINESS_REPORT.md)
- [DEPLOY_CHECKLIST.md](../DEPLOY_CHECKLIST.md)
