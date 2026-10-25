# Referencias

Material de **apoyo**: sistemas de otros equipos que Cortex consulta para tomar ideas,
sin depender de ellos. Es de solo lectura: aquí no se ejecuta, no se mantiene y no se
mezcla con el código de Cortex.

## MediSuite (`medisuite/`)

Propuesta de otro sistema médico para consultorios en México, que llegó como referencia
(carpeta `Agustin-Propuesta`). Sirve para ver cómo resolvieron cosas que Cortex también
necesita o necesitará:

- **Imagen DICOM y servicios opcionales de servidor** (`servidor/`): Orthanc como PACS,
  visor OHIF, Presidio (detección y anonimización de datos personales en texto) y
  Whisper/speaches (voz a texto), detrás de un proxy con CORS. Es lo que más se consulta.
- Modelo clínico tipo FHIR, receta con QR firmado, bitácora de auditoría, caja con
  CFDI 4.0 y despliegue en un VPS con Docker (`deploy/`, `docs/operacion/`).
- La forma de trabajar con Claude: `CLAUDE.md` y `docs/IMPLEMENTAR.md`.

### Qué se dejó fuera, y por qué

Se copió el código y los documentos (unos 4 MB). **No** están:

| Fuera | Peso | Motivo |
|---|---|---|
| `.git` anidado | 28 MB | Un repositorio dentro de otro no se versiona como archivos. |
| `medisuite.zip` | 57 MB | Copia exacta de lo que ya está descomprimido. |
| `public/mediapipe` | 14 MB | Binarios de terceros (WASM). |
| `public/models` | 5.8 MB | Modelos de terceros. |
| `public/excalidraw-assets` | 14 MB | Recursos de terceros. |
| `public/tesseract` y `public/tessdata` | 14 MB | Motor y datos de OCR de terceros. |

Lo que entra a git no se puede adelgazar después: 100 MB de binarios que no sirven como
referencia inflarían el historial de Cortex para siempre. El original completo (con su
ZIP y su historial) se conserva **fuera de git**, en la máquina de Emilio
(`Agustin-Propuesta/`, que `.gitignore` ignora).

Por eso esta copia **no arranca tal cual**: el modo con reconocimiento de pose, el OCR y
los dibujos necesitan esos binarios. Para correrla, usa el original.

### Advertencias

- `CLAUDE.md` y `docs/IMPLEMENTAR.md` de esa carpeta son instrucciones **de MediSuite**,
  no de Cortex. Si contradicen el `CLAUDE.md` de la raíz del repositorio, manda el de la
  raíz.
- No trae archivo de licencia. Antes de copiar código a Cortex, hay que aclarar con su
  autor bajo qué condiciones puede reutilizarse; lo normal es tomar la idea y escribirla
  de nuevo con las reglas de Cortex.
- Su CI y su Dependabot (`.github/`) no corren aquí: GitHub sólo ejecuta los de la raíz.
