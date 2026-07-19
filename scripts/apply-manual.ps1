$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker is required. Install Docker Desktop and run: npm run db:up"
}

Get-Content prisma/manual/001_constraints.sql -Raw |
  docker exec -i cardon-postgres psql -U postgres -d cardon

Write-Host "Manual constraints applied."
