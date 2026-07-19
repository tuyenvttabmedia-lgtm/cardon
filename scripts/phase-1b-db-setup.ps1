# Phase 1B — apply migration + manual SQL + seed
# Requires: Docker Desktop, Node.js/npm (or Cursor bundled node + installed deps)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

Write-Host "Starting Docker services..."
docker compose up -d

Write-Host "Waiting for PostgreSQL..."
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  docker exec cardon-postgres pg_isready -U postgres -d cardon 2>$null
  if ($LASTEXITCODE -eq 0) { $ready = $true; break }
  Start-Sleep -Seconds 2
}
if (-not $ready) { throw "PostgreSQL did not become ready in time." }

$node = $env:NODE_EXE
if (-not $node) {
  $cursorNode = "$env:LOCALAPPDATA\Programs\cursor\resources\app\resources\helpers\node.exe"
  if (Test-Path $cursorNode) { $node = $cursorNode } else { $node = "node" }
}

Write-Host "Applying Prisma migration (init_cardon_schema)..."
if (Get-Command npm -ErrorAction SilentlyContinue) {
  npx prisma migrate deploy
} else {
  & $node node_modules/prisma/build/index.js migrate deploy
}

Write-Host "Applying manual constraints..."
Get-Content prisma/manual/001_constraints.sql -Raw | docker exec -i cardon-postgres psql -U postgres -d cardon

Write-Host "Running seed..."
if (Get-Command npm -ErrorAction SilentlyContinue) {
  npx prisma db seed
} else {
  & $node node_modules/prisma/build/index.js db seed
}

Write-Host "Validation..."
if (Get-Command npm -ErrorAction SilentlyContinue) {
  npx prisma migrate status
  npx prisma validate
} else {
  & $node node_modules/prisma/build/index.js migrate status
  & $node node_modules/prisma/build/index.js validate
}

Write-Host "Phase 1B database foundation complete."
