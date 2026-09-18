#Requires -Version 5.1
<#
.SYNOPSIS
    Baja PwC AI Tutor (docker compose down). Nunca borra .env, data/ ni
    ninguna cache: docker compose down por si solo no toca bind mounts.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\scripts\stop.ps1
#>

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot

Push-Location $RepoRoot
try {
    Write-Host "Bajando PwC AI Tutor (docker compose down)..." -ForegroundColor Cyan
    docker compose down
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Listo. .env, data/ y el codigo del repo no se tocaron." -ForegroundColor Green
    } else {
        Write-Host "docker compose down fallo. Revisa los mensajes de arriba." -ForegroundColor Red
        exit 1
    }
} finally {
    Pop-Location
}
