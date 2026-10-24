# Corre en local las mismas tres verificaciones que el pipeline
# (.github/workflows/production-readiness.yml) antes de integrar a develop:
# tipos del frontend, pruebas del frontend y pruebas del backend.
#
# Uso, desde la raiz del repo:  powershell -File scripts/verificar_todo.ps1

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
$fallas = @()

Push-Location (Join-Path $raiz 'frontend')
try {
    Write-Host '== Frontend: type-check' -ForegroundColor Cyan
    npm run type-check
    if ($LASTEXITCODE -ne 0) { $fallas += 'type-check' }

    Write-Host '== Frontend: npm run test' -ForegroundColor Cyan
    npm run test
    if ($LASTEXITCODE -ne 0) { $fallas += 'vitest' }
} finally {
    Pop-Location
}

Push-Location (Join-Path $raiz 'backend')
try {
    Write-Host '== Backend: pytest' -ForegroundColor Cyan
    # El entorno virtual local, si existe; si no, el python del sistema.
    $python = Join-Path (Get-Location) '.venv\Scripts\python.exe'
    if (-not (Test-Path $python)) { $python = 'python' }
    & $python -m pytest -q
    if ($LASTEXITCODE -ne 0) { $fallas += 'pytest' }
} finally {
    Pop-Location
}

if ($fallas.Count -gt 0) {
    Write-Host ("Fallo: " + ($fallas -join ', ')) -ForegroundColor Red
    exit 1
}
Write-Host 'Todo en verde.' -ForegroundColor Green
