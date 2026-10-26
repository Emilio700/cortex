# Segmentador de Cortex NATIVO en Windows (sin Docker), con GPU NVIDIA.
#
# Para laptops con poca RAM: dentro de Docker Desktop, torch + CUDA ocupan ~3 GB
# en la VM de WSL y la VM misma ocupa otro tanto; nativo sólo se paga el proceso.
# Ver «Nativo en Windows» en README.md (medido en una RTX 4060 Laptop).
#
#   .\correr_windows.ps1 -Instalar      # la primera vez: venv + torch cu126 + motor (6.1 GB)
#   .\correr_windows.ps1                # levanta el servicio en 127.0.0.1:8030
#   .\correr_windows.ps1 -Rapido        # sólo el modelo de 3 mm (--fast)
#
# El venv y los pesos van en %LOCALAPPDATA%\cortex-segmentador, fuera del repo:
# el repo vive en OneDrive y no conviene sincronizar gigas de bibliotecas.
# Requisitos: Python 3.12 (py -3.12) y el driver NVIDIA (>= 560, CUDA 12.6).
param(
    [string]$Entorno = (Join-Path $env:LOCALAPPDATA "cortex-segmentador"),
    [int]$Puerto = 8030,
    [switch]$Rapido,
    [switch]$Instalar
)
$ErrorActionPreference = "Stop"
$servicio = $PSScriptRoot
$python = Join-Path $Entorno ".venv\Scripts\python.exe"

if ($Instalar) {
    New-Item -ItemType Directory -Force $Entorno | Out-Null
    if (-not (Test-Path $python)) { & py -3.12 -m venv (Join-Path $Entorno ".venv") }
    & $python -m pip install --upgrade pip
    # Mismas versiones que Dockerfile.gpu; torch y torchvision del índice de CUDA 12.6.
    & $python -m pip install --timeout 120 --retries 10 --index-url https://download.pytorch.org/whl/cu126 `
        torch==2.7.1+cu126 torchvision==0.22.1+cu126
    & $python -m pip install --timeout 120 --retries 10 -c (Join-Path $servicio "constraints-motor.txt") `
        -r (Join-Path $servicio "requirements.txt") -r (Join-Path $servicio "requirements-motor.txt")
}
if (-not (Test-Path $python)) { throw "No hay entorno en $Entorno. Corre primero: .\correr_windows.ps1 -Instalar" }

$pesos = Join-Path $Entorno "pesos"
New-Item -ItemType Directory -Force $pesos | Out-Null
$env:TOTALSEG_HOME_DIR = $pesos
$env:TOTALSEG_WEIGHTS_PATH = Join-Path $pesos "nnunet\results"
$env:SEGMENTADOR_FALSO = "0"
$env:SEGMENTADOR_DISPOSITIVO = "gpu"
$env:SEGMENTADOR_RAPIDO = $(if ($Rapido) { "1" } else { "0" })
if (-not $env:SEGMENTADOR_RESPALDO) { $env:SEGMENTADOR_RESPALDO = "rapido" }
if (-not $env:SEGMENTADOR_MALLA) { $env:SEGMENTADOR_MALLA = "refinada" }
# OpenBLAS (numpy/scipy) aparta un búfer por hilo y en Windows eso es memoria
# comprometida: con 20 hilos lógicos, el solo arranque del servicio comprometía
# ~1.3 GB. Con el archivo de paginación fijo, el compromiso es el límite real.
if (-not $env:OPENBLAS_NUM_THREADS) { $env:OPENBLAS_NUM_THREADS = "4" }
# dcm2niix (paquete de PyPI) y los ejecutables del venv.
$env:PATH = (Join-Path $Entorno ".venv\Scripts") + ";" + $env:PATH

# Un puerto tomado da un error 10013 poco claro (en la laptop de prueba, el 8030
# lo reserva http.sys de Windows: «System», PID 4).
$ocupado = Get-NetTCPConnection -LocalPort $Puerto -State Listen -ErrorAction SilentlyContinue
if ($ocupado) {
    $quien = (Get-Process -Id $ocupado[0].OwningProcess -ErrorAction SilentlyContinue).Name
    throw "El puerto $Puerto ya está en uso ($quien). Usa otro: .\correr_windows.ps1 -Puerto 8031 y pon ese puerto en SEGMENTADOR_URL."
}

# Sólo en el equipo local: recibe estudios de pacientes y no lleva autenticación.
Set-Location $servicio
& $python -m uvicorn app.main:app --host 127.0.0.1 --port $Puerto
