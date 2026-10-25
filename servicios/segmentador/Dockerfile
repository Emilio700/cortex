# Segmentador de Cortex. Imagen con versiones fijas: una actualización del motor
# se decide (y se vuelve a validar), no llega sola.
#
#   docker compose --profile ia up -d segmentador
#
# Con SEGMENTADOR_FALSO=1 no hace falta el motor; la imagen lo trae igual para
# que el mismo contenedor sirva en los dos modos.
FROM python:3.12.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    TOTALSEG_HOME_DIR=/pesos

WORKDIR /servicio

COPY requirements.txt requirements-motor.txt ./
# torch de CPU por omisión. Para GPU: --build-arg TORCH_INDEX=https://download.pytorch.org/whl/cu126
ARG TORCH_INDEX=https://download.pytorch.org/whl/cpu
# torchvision del mismo índice: nnU-Net la pide (vía timm) sin versión y, si
# llega de PyPI, arrastra otro torch (para CUDA 13, ~3 GB) encima de éste.
RUN pip install --index-url ${TORCH_INDEX} torch==2.7.1 torchvision==0.22.1 \
 && pip install -r requirements.txt -r requirements-motor.txt

# Los pesos (tarea «total», licencia abierta) se bajan la primera vez y quedan
# en el volumen /pesos. Para una imagen sin red: --build-arg DESCARGAR_PESOS=1.
ARG DESCARGAR_PESOS=0
RUN if [ "$DESCARGAR_PESOS" = "1" ]; then totalseg_download_weights -t total && totalseg_download_weights -t total_fast; fi

COPY app ./app

RUN useradd --create-home segmentador && mkdir -p /pesos && chown segmentador /pesos
USER segmentador

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
