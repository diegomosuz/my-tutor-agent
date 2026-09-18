#Requires -Version 5.1
<#
.SYNOPSIS
    Setup interactivo de PwC AI Tutor para Windows + Docker Desktop.

.DESCRIPTION
    1. Verifica Docker / Docker Compose / que el daemon responda.
    2. Pide (o reusa) el directorio de cursos del host y lo normaliza.
    3. Crea .env desde .env.example (nunca sobrescribe uno existente sin
       confirmacion explicita).
    4. Permite elegir proveedor LLM (pwc/openai) e ingresar la credencial
       SIN eco en pantalla (o omitirla). Nunca imprime la key en consola.
    5. Hace build + up del stack y espera a que el backend este saludable.
    6. Imprime unicamente las URLs finales (nunca secretos).

    .env queda en la raiz del repo, gitignored, con secretos en texto
    plano: no lo compartas ni lo subas a ningun lado.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1
#>

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$EnvExamplePath = Join-Path $RepoRoot ".env.example"
$EnvPath = Join-Path $RepoRoot ".env"
$DefaultCoursesPath = Join-Path $RepoRoot "courses"

# ---------------------------------------------------------------------
# Funciones chicas y testeables (sin efectos secundarios interactivos)
# ---------------------------------------------------------------------

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

function Test-CoursesPathValid {
    param([Parameter(Mandatory)] [string]$Path)
    return (Test-Path -LiteralPath $Path -PathType Container)
}

function Get-NormalizedCoursesPath {
    <#
    Normaliza un path de Windows (con backslashes, unidades tipo C:\, con
    espacios) a un formato "C:/Users/..." que Docker Compose interpreta de
    forma consistente en bind mounts (ver docs/CONFIGURATION.md).
    #>
    param([Parameter(Mandatory)] [string]$RawPath)
    $resolved = (Resolve-Path -LiteralPath $RawPath -ErrorAction Stop).ProviderPath
    return ($resolved -replace '\\', '/')
}

function New-EnvFileFromExample {
    <#
    Copia .env.example a .env. Nunca sobrescribe un .env existente salvo
    que se pase -Force explicitamente (confirmacion ya obtenida antes).
    Devuelve $true si escribio el archivo, $false si lo dejo intacto.
    #>
    param(
        [Parameter(Mandatory)] [string]$ExamplePath,
        [Parameter(Mandatory)] [string]$TargetPath,
        [switch]$Force
    )
    if ((Test-Path -LiteralPath $TargetPath) -and -not $Force) {
        return $false
    }
    Copy-Item -LiteralPath $ExamplePath -Destination $TargetPath -Force
    return $true
}

function Set-EnvValue {
    <#
    Reemplaza (o agrega si no existia) una linea KEY=value dentro de un
    archivo .env, preservando el resto del archivo tal cual. Nunca imprime
    el valor en pantalla (eso es responsabilidad del llamador).
    #>
    param(
        [Parameter(Mandatory)] [string]$EnvFilePath,
        [Parameter(Mandatory)] [string]$Key,
        [AllowEmptyString()] [string]$Value = ""
    )
    $lines = @(Get-Content -LiteralPath $EnvFilePath)
    $pattern = "^$([regex]::Escape($Key))="
    $found = $false
    $newLines = foreach ($line in $lines) {
        if ($line -match $pattern) {
            $found = $true
            "$Key=$Value"
        } else {
            $line
        }
    }
    if (-not $found) {
        $newLines += "$Key=$Value"
    }
    Set-Content -LiteralPath $EnvFilePath -Value $newLines -Encoding UTF8
}

function ConvertFrom-SecureStringPlain {
    <#
    Convierte una SecureString (capturada con Read-Host -AsSecureString,
    sin eco en pantalla) a texto plano SOLO para escribirla en .env — nunca
    se imprime en consola en ningun punto de este script.
    #>
    param([Parameter(Mandatory)] [System.Security.SecureString]$Secure)
    if ($Secure.Length -eq 0) { return "" }
    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
    try {
        return [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    } finally {
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

function Wait-ForBackendHealthy {
    param([string]$BaseUrl, [int]$TimeoutSeconds = 90)
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

function Test-FrontendReachable {
    param([string]$BaseUrl, [int]$TimeoutSeconds = 30)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri $BaseUrl -Method Get -TimeoutSec 3 -UseBasicParsing
            if ($response.StatusCode -lt 500) { return $true }
        } catch {
            Start-Sleep -Seconds 2
        }
    }
    return $false
}

# ---------------------------------------------------------------------
# Flujo interactivo principal
# ---------------------------------------------------------------------

function Invoke-Setup {
    Write-Host ""
    Write-Host "PwC AI Tutor - setup" -ForegroundColor Cyan
    Write-Host "=====================" -ForegroundColor Cyan
    Write-Host ""

    if (-not (Test-DockerInstalled)) {
        Write-Host "No se encontro Docker. Instala Docker Desktop: https://www.docker.com/products/docker-desktop/" -ForegroundColor Red
        exit 1
    }
    if (-not (Test-DockerDaemonRunning)) {
        Write-Host "Docker esta instalado pero el daemon no responde. Abri Docker Desktop y esperalo." -ForegroundColor Red
        exit 1
    }
    if (-not (Test-DockerComposeAvailable)) {
        Write-Host "docker compose no esta disponible. Actualiza Docker Desktop." -ForegroundColor Red
        exit 1
    }
    Write-Host "[OK] Docker Desktop y Docker Compose disponibles." -ForegroundColor Green

    # --- .env: crear desde .env.example, nunca sobrescribir sin permiso ---
    $envExists = Test-Path -LiteralPath $EnvPath
    if ($envExists) {
        $answer = Read-Host ".env ya existe. Sobrescribirlo con los valores de .env.example? (escribi 'si' para confirmar, cualquier otra cosa lo deja como esta)"
        if ($answer -eq "si") {
            New-EnvFileFromExample -ExamplePath $EnvExamplePath -TargetPath $EnvPath -Force | Out-Null
            Write-Host "[OK] .env recreado desde .env.example." -ForegroundColor Green
        } else {
            Write-Host "[OK] Se mantiene el .env existente sin cambios de contenido base." -ForegroundColor Green
        }
    } else {
        New-EnvFileFromExample -ExamplePath $EnvExamplePath -TargetPath $EnvPath | Out-Null
        Write-Host "[OK] .env creado desde .env.example." -ForegroundColor Green
    }

    # --- Directorio de cursos ---
    $coursesInput = Read-Host "Directorio de cursos en tu PC (Enter para usar el curso de demo incluido en .\courses)"
    if ([string]::IsNullOrWhiteSpace($coursesInput)) {
        $coursesInput = $DefaultCoursesPath
    }
    if (-not (Test-CoursesPathValid -Path $coursesInput)) {
        Write-Host "El directorio '$coursesInput' no existe. Crealo primero o usa el default." -ForegroundColor Red
        exit 1
    }
    $normalizedCoursesPath = Get-NormalizedCoursesPath -RawPath $coursesInput
    Set-EnvValue -EnvFilePath $EnvPath -Key "COURSES_HOST_PATH" -Value $normalizedCoursesPath
    Write-Host "[OK] COURSES_HOST_PATH = $normalizedCoursesPath" -ForegroundColor Green

    # --- Proveedor LLM (opcional) ---
    Write-Host ""
    $provider = Read-Host "Proveedor de IA para generar clases: 'pwc', 'openai', o Enter para omitir por ahora"
    if ($provider -eq "pwc" -or $provider -eq "openai") {
        Set-EnvValue -EnvFilePath $EnvPath -Key "LLM_PROVIDER" -Value $provider
        $keyLabel = if ($provider -eq "pwc") { "PWC_GENAI_API_KEY" } else { "OPENAI_API_KEY" }
        $secureKey = Read-Host -Prompt "$keyLabel (no se muestra en pantalla; Enter para omitir)" -AsSecureString
        $plainKey = ConvertFrom-SecureStringPlain -Secure $secureKey
        if ($plainKey) {
            Set-EnvValue -EnvFilePath $EnvPath -Key $keyLabel -Value $plainKey
            Write-Host "[OK] Credencial de $provider guardada en .env (nunca se imprime)." -ForegroundColor Green
        } else {
            Write-Host "[OK] Proveedor '$provider' configurado sin credencial todavia (la app funciona igual sin IA)." -ForegroundColor Green
        }
    } else {
        Write-Host "[OK] Sin proveedor de IA configurado. La app funciona igual (catalogo, cursos, aula)." -ForegroundColor Green
    }

    # --- Build + up ---
    Write-Host ""
    Write-Host "Construyendo imagenes (docker compose build)..." -ForegroundColor Cyan
    Push-Location $RepoRoot
    try {
        docker compose build
        if ($LASTEXITCODE -ne 0) {
            Write-Host "docker compose build fallo. Revisa los mensajes de arriba." -ForegroundColor Red
            exit 1
        }

        Write-Host "Levantando containers (docker compose up -d)..." -ForegroundColor Cyan
        docker compose up -d
        if ($LASTEXITCODE -ne 0) {
            Write-Host "docker compose up fallo. Revisa los mensajes de arriba." -ForegroundColor Red
            exit 1
        }
    } finally {
        Pop-Location
    }

    Write-Host "Esperando a que el backend este saludable..." -ForegroundColor Cyan
    $backendUrl = "http://localhost:8000"
    $frontendUrl = "http://localhost:5173"
    $healthy = Wait-ForBackendHealthy -BaseUrl $backendUrl -TimeoutSeconds 90
    if (-not $healthy) {
        Write-Host "El backend no respondio a tiempo. Ejecuta .\scripts\doctor.ps1 para mas detalle." -ForegroundColor Yellow
    }
    $frontendReady = Test-FrontendReachable -BaseUrl $frontendUrl -TimeoutSeconds 30

    Write-Host ""
    Write-Host "===================================" -ForegroundColor Cyan
    Write-Host "Listo." -ForegroundColor Green
    Write-Host "Frontend: $frontendUrl"
    Write-Host "Backend:  $backendUrl"
    Write-Host "Docs API: $backendUrl/docs"
    if (-not $frontendReady) {
        Write-Host "(El frontend todavia esta iniciando; dale unos segundos mas.)" -ForegroundColor Yellow
    }
    Write-Host "===================================" -ForegroundColor Cyan
    Write-Host ""
}

if ($MyInvocation.InvocationName -ne '.') {
    Invoke-Setup
}
