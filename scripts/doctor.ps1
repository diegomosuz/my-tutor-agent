#Requires -Version 5.1
<#
.SYNOPSIS
    Diagnostico rapido del entorno local de PwC AI Tutor (Fase 7).

.DESCRIPTION
    Verifica, en orden, que Docker Desktop / Docker Compose esten
    disponibles y respondiendo, que los containers esten arriba, y que el
    backend reporte un estado saludable (cursos detectados, estado de IA
    sin exponer secretos, estado de voz, permisos de escritura de cache).
    Nunca modifica nada: es 100% de solo lectura. Nunca imprime una API
    key ni ningun secreto.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\scripts\doctor.ps1
#>

$ErrorActionPreference = "Stop"
$BackendUrl = if ($env:PWC_TUTOR_BACKEND_URL) { $env:PWC_TUTOR_BACKEND_URL } else { "http://localhost:8000" }
$FrontendUrl = if ($env:PWC_TUTOR_FRONTEND_URL) { $env:PWC_TUTOR_FRONTEND_URL } else { "http://localhost:5173" }

function Write-Check {
    param(
        [Parameter(Mandatory)] [string]$Label,
        [Parameter(Mandatory)] [bool]$Ok,
        [string]$Detail = ""
    )
    $symbol = if ($Ok) { "[OK]  " } else { "[FAIL]" }
    $color = if ($Ok) { "Green" } else { "Red" }
    $line = "$symbol $Label"
    if ($Detail) { $line += " - $Detail" }
    Write-Host $line -ForegroundColor $color
}

function Get-StatusSymbolAndColor {
    # v1.0.1: bug real corregido -- "Cursos detectados" mostraba siempre
    # [OK] mirando solo si count > 0, ignorando por completo el campo
    # courses.diagnostics ("ok"/"warning"/"error"), lo que producia el
    # contradictorio "[OK] ... diagnostico: error". Esta funcion mapea un
    # estado de 3 valores a simbolo/color de forma explicita y testeable.
    param([Parameter(Mandatory)] [string]$Status)
    switch ($Status) {
        "ok" { return @{ Symbol = "[OK]  "; Color = "Green" } }
        "warning" { return @{ Symbol = "[WARN]"; Color = "Yellow" } }
        "error" { return @{ Symbol = "[FAIL]"; Color = "Red" } }
        default { return @{ Symbol = "[FAIL]"; Color = "Red" } }
    }
}

function Write-StatusCheck {
    param(
        [Parameter(Mandatory)] [string]$Label,
        [Parameter(Mandatory)] [string]$Status,
        [string]$Detail = ""
    )
    $mapped = Get-StatusSymbolAndColor -Status $Status
    $line = "$($mapped.Symbol) $Label"
    if ($Detail) { $line += " - $Detail" }
    Write-Host $line -ForegroundColor $mapped.Color
}

function Test-DockerInstalled {
    try {
        $null = Get-Command docker -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

function Test-DockerComposeAvailable {
    try {
        $null = docker compose version 2>$null
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
}

function Test-DockerDaemonRunning {
    try {
        $null = docker info 2>$null
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
}

function Get-ComposeStatusLines {
    try {
        return (docker compose ps --format "table {{.Name}}\t{{.Status}}" 2>$null)
    } catch {
        return $null
    }
}

function Invoke-JsonGet {
    param([Parameter(Mandatory)] [string]$Url)
    try {
        return Invoke-RestMethod -Uri $Url -Method Get -TimeoutSec 5
    } catch {
        return $null
    }
}

function Get-BackendHealth {
    param([string]$BaseUrl)
    return Invoke-JsonGet -Url "$BaseUrl/api/health"
}

function Get-SystemStatus {
    param([string]$BaseUrl)
    return Invoke-JsonGet -Url "$BaseUrl/api/system/status"
}

function Get-ReadyStatus {
    param([string]$BaseUrl)
    return Invoke-JsonGet -Url "$BaseUrl/api/ready"
}

function Test-FrontendReachable {
    param([string]$BaseUrl)
    try {
        $response = Invoke-WebRequest -Uri $BaseUrl -Method Get -TimeoutSec 5 -UseBasicParsing
        return $response.StatusCode -lt 500
    } catch {
        return $false
    }
}

function Invoke-Doctor {
    Write-Host ""
    Write-Host "PwC AI Tutor - doctor" -ForegroundColor Cyan
    Write-Host "======================" -ForegroundColor Cyan
    Write-Host ""

    $dockerInstalled = Test-DockerInstalled
    Write-Check -Label "Docker instalado" -Ok $dockerInstalled
    if (-not $dockerInstalled) {
        Write-Host ""
        Write-Host "Instala Docker Desktop: https://www.docker.com/products/docker-desktop/" -ForegroundColor Yellow
        return
    }

    $daemonRunning = Test-DockerDaemonRunning
    Write-Check -Label "Docker Desktop respondiendo" -Ok $daemonRunning
    if (-not $daemonRunning) {
        Write-Host ""
        Write-Host "Abri Docker Desktop y espera a que el icono indique que esta listo." -ForegroundColor Yellow
        return
    }

    $composeOk = Test-DockerComposeAvailable
    Write-Check -Label "Docker Compose disponible" -Ok $composeOk

    $composeStatus = Get-ComposeStatusLines
    if ($composeStatus) {
        Write-Host ""
        Write-Host "Containers:" -ForegroundColor Cyan
        $composeStatus | ForEach-Object { Write-Host "  $_" }
        Write-Host ""
    }

    $health = Get-BackendHealth -BaseUrl $BackendUrl
    Write-Check -Label "Backend healthy ($BackendUrl/api/health)" -Ok ($null -ne $health)

    $ready = Get-ReadyStatus -BaseUrl $BackendUrl
    if ($ready) {
        Write-Check -Label "Directorio de cursos legible" -Ok $ready.content_readable
        Write-Check -Label "Cache local escribible (/app/data)" -Ok $ready.data_writable
    } else {
        Write-Check -Label "GET /api/ready" -Ok $false -Detail "backend no respondio"
    }

    $status = Get-SystemStatus -BaseUrl $BackendUrl
    if ($status) {
        $coursesStatus = if ($status.courses.count -le 0) { "error" } else { $status.courses.diagnostics }
        Write-StatusCheck -Label "Cursos detectados" -Status $coursesStatus -Detail "$($status.courses.count) curso(s), diagnostico: $($status.courses.diagnostics)"
        Write-Check -Label "Proveedor LLM" -Ok $true -Detail "$($status.llm.provider) - configured=$($status.llm.configured)"
        Write-Check -Label "Voz" -Ok $true -Detail "modo=$($status.voice.provider) neural_configured=$($status.voice.neural_configured)"
        Write-Check -Label "Cache escribible (system/status)" -Ok $status.cache_writable
    } else {
        Write-Check -Label "GET /api/system/status" -Ok $false -Detail "backend no respondio"
    }

    $frontendOk = Test-FrontendReachable -BaseUrl $FrontendUrl
    Write-Check -Label "Frontend alcanzable ($FrontendUrl)" -Ok $frontendOk

    Write-Host ""
    if ($health -and $ready -and $ready.content_readable -and $ready.data_writable -and $frontendOk) {
        Write-Host "Todo en orden." -ForegroundColor Green
    } else {
        Write-Host "Hay problemas que revisar arriba. Proba 'docker compose up -d' o revisa el README." -ForegroundColor Yellow
    }
    Write-Host ""
}

# Solo ejecuta el diagnostico si el script corre directamente (no cuando se
# dot-source para reusar las funciones en tests, ver docs/CONFIGURATION.md).
if ($MyInvocation.InvocationName -ne '.') {
    Invoke-Doctor
}
