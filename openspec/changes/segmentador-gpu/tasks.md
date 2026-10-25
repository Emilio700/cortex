# Tareas · segmentador-gpu

## 1. Imagen y Compose
- [x] 1.1 `Dockerfile.gpu` con torch 2.7.1+cu126 y torchvision fijos, licencias anotadas
- [x] 1.2 Servicio `segmentador-gpu` (perfil `ia-gpu`, GPU nvidia, `shm_size`, alias `segmentador`)
- [x] 1.3 Pesos en `cortex_segmentador_pesos` con `TOTALSEG_HOME_DIR` y `TOTALSEG_WEIGHTS_PATH`
- [x] 1.4 Construida y levantada; `/health` reporta `cuda` y «NVIDIA GeForce RTX 4060 Laptop GPU»
- [ ] 1.5 Reconstruir con el `Dockerfile.gpu` final y llenar `constraints-motor.txt` con su `pip freeze`
      (la imagen medida quedó con torch 2.14.1+cu130 encima por un build anterior; ver README)

## 2. Robustez
- [x] 2.1 Motor en proceso aparte, en su sesión; nnU-Net sin procesos auxiliares
- [x] 2.2 Sin GPU / VRAM / RAM: 503 claro, `X-Cortex-Falta`, respaldo rápido o CPU configurable
- [x] 2.3 Nunca GLB vacío como éxito (422 con el motivo de la región)
- [x] 2.4 Pruebas en modo falso (motor sustituido) de cada ruta
- [x] 2.5 Visto en real: sin RAM con 3 GB → 503 `sin_ram` y el servicio sigue vivo

## 3. Regiones extra
- [x] 3.1 Licencias verificadas con `totalseg_info --list-tasks` (2.18.0)
- [x] 3.2 `columna`+`MR`, `discos`, `craneo`, `vasos-cuello`, `hemorragia` con ids de catálogo
- [x] 3.3 Discos nombrados por nivel; sin vecinas → `disco-sin-nivel`
- [ ] 3.4 Probar al menos una tarea extra de verdad (pendiente: no hubo RAM)

## 4. Malla
- [x] 4.1 Taubin + decimación cuádrica; acabado `clasica` disponible para comparar
- [x] 4.2 Comparación sobre máscaras reales (TotalSegmentator `s0923`): triángulos, tamaño, volumen, captura
- [x] 4.3 Tope 8000 (mismo peso de GLB que la clásica con 12 000)

## 5. Medición real (pendiente de RAM)
- [x] 5.1 dcm2niix real sobre 500 cortes DICOM: 15 s
- [x] 5.2 Camino completo (DICOM → dcm2niix → máscaras → mallas → GLB) con máscaras de referencia: 27 mallas, ids C1–L5, sacro, médula y conducto, mm y LPS
- [ ] 5.3 `POST /segmentar` normal y `--fast` en GPU y en CPU: tiempo por etapa, VRAM y RAM pico, tamaño del GLB
- [ ] 5.4 Dice contra las máscaras de referencia de `s0923`

## 6. Punta a punta con el backend (pedir permiso antes)
- [ ] 6.1 `docker compose --profile ia-gpu up -d segmentador-gpu`
- [ ] 6.2 En `backend/.env`: `SEGMENTADOR_URL=http://127.0.0.1:8030` (el API de desarrollo corre fuera de Docker) y reiniciar uvicorn
- [ ] 6.3 Sistema → Servicios: «Segmentador» en línea; activar el módulo `neuro3d_paciente`
- [ ] 6.4 Subir un estudio TC de columna (no de un paciente real), abrir la serie en el visor, «Generar modelo 3D»
- [ ] 6.5 Esperar «Modelo 3D listo», «Ver en Neuro 3D», elegir «Tomografía del paciente» y revisar que la vértebra L5 del paciente se encienda al tocar la raíz L5

## 7. Documentación
- [x] 7.1 README del segmentador: GPU, cómo levantar, medido, licencias, cómo aligerar la imagen
- [x] 7.2 CHANGELOG `[Sin publicar]`
