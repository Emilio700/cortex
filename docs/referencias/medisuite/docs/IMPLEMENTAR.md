# Implementar MediSuite — guía paso a paso

Guía ejecutable para una persona o para Claude Code. Cada paso tiene un **criterio de listo**: no avances hasta cumplirlo. Lee antes `CLAUDE.md` (reglas del proyecto).

> **Para Claude:** sigue los pasos en orden. Antes de cualquier acción irreversible o externa (crear repositorios, comprar dominios, desplegar, enviar mensajes reales, timbrar facturas reales) confirma con el usuario. Nunca pegues secretos (`.env`, llaves, contraseñas) en el chat, commits ni issues.

---

## Paso 1 · Verificar el proyecto en local

Requisitos: Node.js 22, npm, Git. Docker solo para el paso 4.

```bash
unzip medisuite.zip && cd medisuite
npm install
cd api && npm install && cd ..
npx tsc -b && npm test && npm run build
cd api && npm run typecheck && npm test && npm run check:seed && cd ..
npm run dev        # abrir http://localhost:5173 → debe verse "Modo demo"
```

Opcional, flujo completo con servidor: `npm run e2e` (levanta Postgres embebido, API y Vite; tarda ~3 min).

**Listo cuando:** todas las pruebas pasan y el modo demo abre Inicio, Pacientes y Triaje sin errores en la consola.

## Paso 2 · Subir a GitHub

```bash
git status                     # el zip incluye el historial (.git)
git remote add origin git@github.com:<usuario>/<repo>.git
git push -u origin main
```

En GitHub: proteger `main` (PR obligatorio + CI verde), activar Dependabot y los avisos de seguridad.

**Listo cuando:** el workflow `CI` (`.github/workflows/ci.yml`) termina en verde.

## Paso 3 · Ambiente de pruebas (staging) con datos sintéticos

Igual que producción (paso 4) pero con `SEED_DEMO=true` y un subdominio, p. ej. `staging.miclinica.mx`. Sirve para probar integraciones y capacitar sin datos reales.

**Listo cuando:** puedes entrar con los usuarios demo (`admin@demo.mx`, `medico@demo.mx`, `recepcion@demo.mx`, `enfermeria@demo.mx`, contraseña `DEMO_PASSWORD`) y cada rol ve solo sus módulos.

## Paso 4 · Producción en un VPS

Detalle completo en `docs/operacion/despliegue.md`. Resumen:

1. VPS Ubuntu LTS con 2 vCPU y 4 GB RAM mínimo (8 GB si activas Whisper/Presidio), región México/EE. UU.
2. DNS: registro `A` de `expediente.tuclinica.mx` → IP del VPS.
3. Instalar Docker Engine + Compose v2, firewall (`ufw allow 22,80,443`), actualizaciones automáticas.
4. Configurar:
   ```bash
   git clone <repo> medisuite && cd medisuite/deploy
   cp .env.example .env
   openssl rand -base64 32      # → MASTER_KEY (guárdala también fuera del servidor)
   openssl rand -hex 24         # → POSTGRES_PASSWORD y APP_DB_PASSWORD (distintas)
   nano .env                    # DOMINIO, ADMIN_EMAIL, ADMIN_PASSWORD (≥12 caracteres), TZ, SEED_DEMO=false
   ```
5. Arrancar: `docker compose up -d --build` y revisar `docker compose ps` (todo `healthy`).
6. Primer acceso: `https://DOMINIO` → entrar con el admin → **activar 2FA** → crear usuarios reales en **Usuarios** → capturar perfil del médico (cédula, especialidad) en **Configuración**.
7. Respaldos: definir `BACKUP_AGE_RECIPIENTS` (cifrado) y, de preferencia, destino S3 externo. Hacer una **restauración de prueba** (`docs/operacion/respaldos.md`).

**Listo cuando:** HTTPS válido, `https://DOMINIO/api/health` responde `{"app":"medisuite",…,"db":"ok"}`, el admin tiene 2FA y una restauración de prueba funcionó.

## Paso 5 · Integraciones (opcionales, una por una)

| Integración | Variables en `deploy/.env` | Cómo probar |
|---|---|---|
| Correo (recuperar contraseña) | `SMTP_URL` o `SMTP_HOST/PORT/USER/PASS`, `MAIL_FROM` (`PUBLIC_URL` se calcula del dominio) | Login → "¿Olvidaste tu contraseña?" |
| WhatsApp Cloud API | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`; webhook en Meta: `https://DOMINIO/api/webhooks/whatsapp` | Mensajes → "Mensaje de prueba"; la plantilla aprobada debe tener 4 variables (nombre, fecha, hora, clínica) y 2 botones de respuesta rápida |
| Facturación CFDI (PAC) | `FACTURAPI_KEY` (primero la llave de **pruebas**) | Caja → cobro → "Timbrar con PAC"; revisar el CFDI en el portal de Facturapi |
| Almacenamiento S3 | `STORAGE=s3`, `S3_*` | Subir un documento y descargarlo |
| Imagen y voz (servidor) | perfil `servicios` (Orthanc, OHIF, Whisper, Presidio) | Servicios → estado en verde; subir un DICOM |

**Listo cuando:** cada integración activada pasó su prueba en staging antes de usarla en producción.

## Paso 6 · Antes del primer paciente real (obligatorio)

- [ ] Revisión médica del contenido marcado **"(verificar)"** en la interfaz (vacunación, tamizajes, triaje, nutrición, certificados) contra la fuente oficial vigente.
- [ ] Decidir qué módulos se habilitan según `docs/plan-mejora.md` → "Clasificación regulatoria" (los de IA con sugerencias clínicas quedan apagados hasta tener dictamen de COFEPRIS).
- [ ] Aviso de privacidad publicado (`docs/operacion/aviso-privacidad-plantilla.md`) y consentimiento expreso para datos sensibles.
- [ ] Contratos de encargado con hosting, proveedor de IA, Meta y PAC.
- [ ] Pentest externo con hallazgos altos/críticos corregidos.
- [ ] Revisión legal de `docs/operacion/cumplimiento.md` (NOM-004, NOM-024, LFPDPPP 2025, NOM-151).
- [ ] Capacitación por rol y procedimiento de incidentes (`docs/operacion/seguridad.md`).

## Paso 7 · Operar y mejorar

- Seguir `docs/plan-mejora.md` por fases (P0 → P1 → P2).
- Cada cambio: rama → PR → CI verde → staging → producción (`docs/operacion/despliegue.md` §9 actualizar, §10 rollback).
- Revisar la **Bitácora** cada semana y las alertas de respaldo.

---

## Prompts útiles para Claude Code

Copiar tal cual en una sesión de Claude Code abierta en la raíz del repo:

- **Verificar todo:** "Lee CLAUDE.md y corre la verificación completa (frontend, api, check:seed y e2e). Si algo falla, diagnostica la causa y corrígela con su prueba."
- **Nueva herramienta:** "Siguiendo la sección 'Cómo agregar una herramienta nueva' de CLAUDE.md, crea el módulo `<id>` para `<qué hace>`. Usa fuentes clínicas citadas; lo que no puedas confirmar márcalo '(verificar)'. Incluye pruebas vitest, datos demo y una prueba e2e."
- **Fase 0 del plan:** "Implementa la tarea 0.6 de docs/plan-mejora.md (rotación de MASTER_KEY) con migración segura, script de operación, pruebas y documentación en docs/operacion."
- **Despliegue asistido:** "Guíame paso a paso con docs/IMPLEMENTAR.md para desplegar en mi VPS. Pregúntame cada valor del .env sin mostrarlo en el chat y verifica el criterio de listo de cada paso."
- **Revisión de seguridad de un cambio:** "Revisa el diff contra main con foco en permisos por rol, aislamiento entre organizaciones, bitácora y datos sensibles; corrige lo que encuentres con pruebas."
