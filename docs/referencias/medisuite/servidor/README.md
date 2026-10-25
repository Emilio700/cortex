# MediSuite — servicios de servidor (opcionales)

MediSuite funciona completo en el navegador. Esta carpeta levanta, con Docker, servicios **opcionales** que corren en un equipo de tu clínica (o en tu nube) y amplían el sistema sin enviar datos a terceros:

| Servicio | Imagen | Para qué | Acceso (por defecto) |
|---|---|---|---|
| **Proxy CORS** | `nginx:1.27-alpine` | Un solo puerto con CORS para que la app web hable con todos los servicios | `http://localhost:8080` |
| **Orthanc** | `orthancteam/orthanc` | PACS: guarda estudios DICOM y los sirve por DICOMweb | `http://localhost:8080/orthanc/` · DICOM `4242` |
| **OHIF** | `ohif/app` | Visor radiológico web (series, MPR, mediciones) | `http://localhost:3000` |
| **Whisper** | `ghcr.io/speaches-ai/speaches:latest-cpu` | Voz a texto, API compatible con OpenAI | `http://localhost:8080/whisper/` |
| **Presidio Analyzer** | `mcr.microsoft.com/presidio-analyzer` (+ español) | Detecta datos personales en texto antes de enviarlo a una IA | `http://localhost:8080/presidio-analyzer/` |
| **Presidio Anonymizer** | `mcr.microsoft.com/presidio-anonymizer` | Reemplaza/enmascara las entidades detectadas | `http://localhost:8080/presidio-anonymizer/` |

## Requisitos

- Docker Engine 24+ con Docker Compose v2 (Docker Desktop en Windows/Mac).
- 4 núcleos y 8 GB de RAM como mínimo (Whisper `small` en CPU usa ~2 GB; Presidio ~1.5 GB).
- Disco: lo que ocupen tus estudios DICOM + ~3 GB de imágenes y modelos.

## Inicio rápido

```bash
cd servidor
cp .env.example .env          # opcional: puertos y origen CORS
docker compose up -d --build  # la primera vez construye Presidio con español
docker compose ps
```

Descarga el modelo de Whisper la primera vez (queda en el volumen `whisper-models`):

```bash
curl -X POST http://localhost:8080/whisper/v1/models/Systran/faster-whisper-small
```

Pruebas rápidas:

```bash
curl http://localhost:8080/                         # MediSuite servidor OK
curl http://localhost:8080/orthanc/system           # JSON de Orthanc
curl http://localhost:8080/whisper/health
curl http://localhost:8080/presidio-analyzer/health
curl -X POST http://localhost:8080/presidio-analyzer/analyze \
  -H 'content-type: application/json' \
  -d '{"text":"La paciente María López, CURP LORM680314MDFPMR09, tel 55 1234 5678","language":"es"}'
```

## Conectar MediSuite

En MediSuite abre **Sistema → Servicios** (o *Configuración → Servicios*) y escribe:

| Campo | Valor |
|---|---|
| Orthanc | `http://localhost:8080/orthanc` |
| OHIF | `http://localhost:3000` |
| Whisper | `http://localhost:8080/whisper` |
| Presidio | `http://localhost:8080/presidio-analyzer` |

Presiona **Guardar y revisar**: cada servicio debe mostrar *En línea*. Si usas MediSuite desde otro equipo, cambia `localhost` por la IP o el dominio del servidor — también en `ohif/app-config.js`, porque esas URL las usa el navegador.

Qué usa cada módulo:

- **Servicios**: subir archivos DICOM a Orthanc (`POST /instances`), listar estudios y abrirlos en OHIF (`/viewer?StudyInstanceUIDs=…`).
- **Dictado → Whisper servidor**: `POST {whisper}/v1/audio/transcriptions` (multipart: `file`, `model`, `language=es`).
- **Asistente IA**: antes de enviar a Claude llama `POST {presidio}/analyze` con `language: "es"` y reemplaza las entidades **en el navegador** (así puede re-identificar la respuesta localmente). Si Presidio no responde, se usa solo el anonimizador local.

## Notas por servicio

**Orthanc.** DICOMweb queda en `/orthanc/dicom-web/` y WADO-URI en `/orthanc/wado`. `ORTHANC__DICOM_WEB__PUBLIC_ROOT` está fijado a `/orthanc/dicom-web/` por el proxy; si cambias la ruta, actualízalo. Para recibir estudios desde un equipo (rayos X, ultrasonido) configura en el equipo: AE Title `MEDISUITE`, IP del servidor, puerto `4242`. La interfaz de administración está en `http://localhost:8080/orthanc/ui/app/` (Orthanc Explorer 2) o `/orthanc/app/explorer.html`.

**OHIF.** Se configura con `ohif/app-config.js` (montado en `/usr/share/nginx/html/app-config.js`). El proxy también expone `/ohif/`, pero eso solo funciona con una compilación de OHIF hecha con `PUBLIC_URL=/ohif/`; por defecto usa el puerto 3000.

**Whisper (speaches).** Verifica la etiqueta vigente de la imagen en el repositorio de speaches (`latest-cpu`, o `latest-cuda` si tienes GPU NVIDIA con `nvidia-container-toolkit`; en ese caso agrega `deploy.resources.reservations.devices`). Modelos recomendados: `Systran/faster-whisper-small` (CPU), `Systran/faster-whisper-large-v3` o `deepdml/faster-whisper-large-v3-turbo-ct2` (GPU). En MediSuite escribe el mismo nombre en "Modelo del servidor".

**Presidio.** La imagen oficial solo trae el modelo de inglés. `presidio/Dockerfile` agrega `es_core_news_md` y la configuración de `presidio/conf/` (idiomas es/en, reconocedores de CURP, RFC y teléfono de México). Los nombres de variables (`NLP_CONF_FILE`, `RECOGNIZER_REGISTRY_CONF_FILE`, `ANALYZER_CONF_FILE`) corresponden a las versiones recientes de Presidio; si cambian, revisa la documentación de *presidio-analyzer*. La detección de nombres en español es buena pero no perfecta: MediSuite combina Presidio con su propio anonimizador (datos conocidos del paciente + patrones).

## Producción (antes de usar con pacientes reales)

1. **HTTPS obligatorio.** Pon el proxy detrás de un certificado válido (Caddy, Traefik o nginx + Let's Encrypt). Si MediSuite se sirve por HTTPS, el navegador bloquea llamadas a `http://` que no sean `localhost` (contenido mixto).
2. **Autenticación.** No expongas estos puertos a Internet sin autenticación. Opciones: Keycloak (OIDC) con `oauth2-proxy` delante del proxy, o como mínimo autenticación básica en nginx y `ORTHANC__AUTHENTICATION_ENABLED=true` con usuarios (`ORTHANC__REGISTERED_USERS`). Para Orthanc multiusuario existe el plugin de autorización de orthancteam junto con Keycloak.
3. **CORS restringido.** Cambia `CORS_ALLOW_ORIGIN` en `.env` al dominio exacto de tu MediSuite.
4. **Red.** Publica solo el puerto del proxy (y 4242 únicamente hacia la red de los equipos de imagen). Usa VPN (WireGuard/Tailscale) para acceso remoto.
5. **Respaldos.** Respalda el volumen `orthanc-db` (p. ej. `docker run --rm -v medisuite_orthanc-db:/data -v $PWD:/backup alpine tar czf /backup/orthanc-$(date +%F).tgz /data`) con copia fuera del sitio y cifrada; prueba la restauración. El expediente de MediSuite vive en el navegador: exporta respaldos desde *Configuración*.
6. **Actualizaciones.** Fija versiones (no `latest`) una vez probadas y actualiza con `docker compose pull && docker compose up -d`.
7. **Protección de datos (México).** Los datos de salud son *datos personales sensibles* según la **LFPDPPP**: necesitas aviso de privacidad, consentimiento expreso y por escrito, medidas de seguridad administrativas, técnicas y físicas, bitácora de accesos y atención de derechos ARCO. El expediente debe conservarse al menos 5 años (**NOM-004-SSA3-2012**) y, si es electrónico, cumplir la **NOM-024-SSA3-2012**. Mantener Whisper y Presidio en tu propio servidor evita transferir audio o identificadores a terceros; si usas una IA externa, envía solo texto desidentificado e infórmalo en tu aviso de privacidad.

## Detener / eliminar

```bash
docker compose down        # detiene (conserva datos)
docker compose down -v     # ¡borra también estudios DICOM y modelos!
```
