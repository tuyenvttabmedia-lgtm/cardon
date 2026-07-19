# Phase 1B.1 — Database runtime verification (all steps + DB checks)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

$node = $env:NODE_EXE
if (-not $node) {
  $cursorNode = "$env:LOCALAPPDATA\Programs\cursor\resources\app\resources\helpers\node.exe"
  if (Test-Path $cursorNode) { $node = $cursorNode } else { $node = "node" }
}

function Invoke-Prisma {
  param([string[]]$Args)
  if (Get-Command npx -ErrorAction SilentlyContinue) {
    & npx prisma @Args
  } else {
    & $node node_modules/prisma/build/index.js @Args
  }
}

Write-Host "=== Phase 1B.1 Runtime Verification ===" -ForegroundColor Cyan

Write-Host "`n[1] Starting Docker services..."
docker compose up -d

Write-Host "`n[2] Verifying containers..."
$ps = docker ps --format "{{.Names}}|{{.Status}}" | Where-Object { $_ -match "cardon-" }
$ps | ForEach-Object { Write-Host "  $_" }
if (-not ($ps -match "cardon-postgres")) { throw "cardon-postgres is not running" }
if (-not ($ps -match "cardon-redis")) { throw "cardon-redis is not running" }

Write-Host "`n[3] Applying Prisma migration..."
Invoke-Prisma @("migrate", "deploy")

Write-Host "`n[4] Applying manual SQL..."
npm run db:manual

Write-Host "`n[5] Running seed..."
Invoke-Prisma @("db", "seed")

Write-Host "`n[6] Prisma validation..."
Invoke-Prisma @("migrate", "status")
Invoke-Prisma @("validate")

Write-Host "`n[7] Database checks..."
$checksSql = @"
SELECT 'tables_public' AS check_name, COUNT(*)::text AS result
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

SELECT 'permissions' AS check_name, COUNT(*)::text AS result FROM permissions;
SELECT 'role_permissions' AS check_name, COUNT(*)::text AS result FROM role_permissions;
SELECT 'system_settings' AS check_name, COUNT(*)::text AS result FROM system_settings;
SELECT 'super_admin' AS check_name, COUNT(*)::text AS result FROM users WHERE role = 'SUPER_ADMIN' AND deleted_at IS NULL;

SELECT 'chk_guest_order_email' AS check_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_guest_order_email'
  ) THEN 'ACTIVE' ELSE 'MISSING' END AS result;

SELECT 'ledger_update_trigger' AS check_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_ledger_no_update'
  ) THEN 'ACTIVE' ELSE 'MISSING' END AS result;

SELECT 'ledger_delete_trigger' AS check_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_ledger_no_delete'
  ) THEN 'ACTIVE' ELSE 'MISSING' END AS result;

SELECT 'partial_index_payment_expires' AS check_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_orders_payment_expires_waiting'
  ) THEN 'ACTIVE' ELSE 'MISSING' END AS result;

SELECT 'partial_index_guest_email' AS check_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_orders_guest_email_guest'
  ) THEN 'ACTIVE' ELSE 'MISSING' END AS result;

SELECT 'partial_index_users_active' AS check_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_users_active'
  ) THEN 'ACTIVE' ELSE 'MISSING' END AS result;
"@

$checksSql | docker exec -i cardon-postgres psql -U postgres -d cardon -t -A -F '|'

Write-Host "`n=== Verification complete ===" -ForegroundColor Green
