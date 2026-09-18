#Requires -Version 5.1
<#
.SYNOPSIS
    Levanta PwC AI Tutor (backend + frontend) y espera a que el backend
    este saludable.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1
#>

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$BackendUrl = if ($env:PWC_TUTOR_BACKEND_URL) { $env:PWC_TUTOR_BACKEND_URL } else { "http://localhost:8000" }
$FrontendUrl = if ($env:PWC_TUTOR_FRONTEND_URL) { $env:PWC_TUTOR_FRONTEND_URL } else { "http://localhost:5173" }

function Wait-ForBackendHealthy {
    param([string]$BaseUrl, [int]$TimeoutSeconds = 60)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $null = Invoke-RestMethod -Uri "$BaseUrl/api/health" -Method Get -TimeoutSec 3
            return $true
        } catch {
            Start-Sleep -Seconds 2
        }
    }
    return $false
}

Push-Location $RepoRoot
try {
    if (-not (Test-Path ".env")) {
        Write-Host "No existe .env todavia. Ejecuta primero: powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1" -ForegroundColor Yellow
        exit 1
    }

    Write-Host "Levantando PwC AI Tutor (docker compose up -d)..." -ForegroundColor Cyan
    docker compose up -d
    if ($LASTEXITCODE -ne 0) {
        Write-Host "docker compose up -d fallo. Revisa los mensajes de arriba." -ForegroundColor Red
        exit 1
    }

    Write-Host "Esperando a que el backend este saludable..." -ForegroundColor Cyan
    $healthy = Wait-ForBackendHealthy -BaseUrl $BackendUrl -TimeoutSeconds 60
    if (-not $healthy) {
        Write-Host "El backend no respondio a tiempo. Ejecuta .\scripts\doctor.ps1 para mas detalle." -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host "Listo." -ForegroundColor Green
    Write-Host "Frontend: $FrontendUrl"
    Write-Host "Backend:  $BackendUrl"
    Write-Host "Docs:     $BackendUrl/docs"
    Write-Host ""
} finally {
    Pop-Location
}
