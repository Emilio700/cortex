# G.E.M.S. — Gynecology & Expert Management System

Sistema clínico web para consultorios de ginecología y obstetricia: agenda, expediente,
consulta con notas SOAP, recetas, órdenes de estudios, cobros y corte de caja, con
permisos por rol y bitácora de todo lo clínico. Sustituye la operación que vivía en
Visual FoxPro.

**Versión actual: 1.0.0** (2026-09-29) · en producción, con doctoras y pacientes reales.

---

## Qué hace, por rol

| Rol | Lo principal |
|-----|--------------|
| **Doctora** | Consulta en pasos (triage, SOAP, receta, certificado, consentimiento), plan clínico y control prenatal, órdenes de estudios con PDF (sueltas o agrupadas, con plantillas), bandeja «Órdenes y resultados», expediente con historial de estudios, «Mis cobros» |
| **Recepción** | Agenda (buscar, imprimir, cobrar desde la cita, dar de alta a la paciente sin salir de la cita, reenviar confirmación), triage del día, preregistro, documentos, «Órdenes de estudio» (entregar el papel y subir el resultado) |
| **Finanzas** | Cobros con idempotencia y sin cobro doble, comprobante imprimible, corte de caja por doctora |
| **Administración** | Usuarios, roles personalizados y permisos, sucursales, servicios, bitácora de auditoría |
| **Master** | Todo lo anterior en todas las sucursales, y el panel de desarrollador |

La ayuda vive en el «?» del encabezado: recorridos guiados (driver.js) que la persona abre
cuando tiene una duda. Ninguno arranca solo.

---

## Tecnología

- **Frontend:** React 19, Vite 7, TypeScript 5.9, CoreUI Pro 5, FullCalendar, React Router 7,
  driver.js · pruebas con Vitest.
- **Backend:** FastAPI, SQLAlchemy 2, Alembic, Pydantic 2, ReportLab (PDF), APScheduler ·
  pruebas con pytest · gunicorn + uvicorn en producción.
- **Datos:** PostgreSQL 15 (con `pg_trgm` para la búsqueda), ClamAV para revisar archivos subidos.

---

## Arranque local

Requisitos: Docker y Docker Compose, Node.js 20+ y npm, Python 3.11+ (para correr las
pruebas del backend fuera de Docker).

```bash
# Base de datos y backend
docker compose up -d
docker compose exec backend alembic upgrade head
docker compose exec backend python scripts/seed.py     # datos de demostración

# Frontend
cd frontend
npm ci
npm run dev
```

- Frontend: <http://localhost:3000>
- API: <http://localhost:8000> · documentación: <http://localhost:8000/docs> · salud: <http://localhost:8000/health>

Credenciales de demostración: las crea `backend/scripts/seed.py` (las contraseñas de los
usuarios de demo se rotaron; no se publican aquí).

---

## Verificar antes de reportar o fusionar

Siempre `npm ci` primero: con `node_modules` desincronizado las pruebas fallan por causas
que no son del código.

```bash
# frontend/
npm ci
npx tsc --noEmit        # el build NO valida tipos; esto sí
npm test                # vitest

# backend/  (usa el Python del venv; el pytest global no recolecta)
.venv/Scripts/python -m pytest -q
```

En Windows, `scripts/verificar_todo.ps1` corre las tres verificaciones de un jalón. En
GitHub, el workflow `production-readiness.yml` las corre en cada PR y en cada push a
`main` y `develop`. Detalle en [`docs/plans/25_guia_verificacion.md`](docs/plans/25_guia_verificacion.md).

---

## Flujo de ramas

```
feat/… · fix/… · docs/…   ─┐
                           ├──►  develop  ──►  main  (= producción, con etiqueta vX.Y.Z)
otra sesión / otra persona ─┘
```

- **`main` es lo que está en producción.** Nadie trabaja ni commitea directo ahí. Solo recibe
  `develop` cuando ya está probado, y cada vez que se despliega lleva su etiqueta de versión.
- **`develop` es la integración.** Toda rama nace de `develop` y regresa a `develop`. Ahí se
  juntan los cambios de distintas sesiones y se verifica que funcionen juntos.
- **Una rama por unidad de trabajo**, con los nombres de siempre: `feat/…`, `fix/…`, `docs/…`,
  `ci/…`. Mensajes de commit en español, asunto sin acentos, cuerpo con el porqué.
- **Nunca** `git push --force` a `main` ni a `develop`. Las ramas fusionadas se conservan para
  trazabilidad.
- Las reglas completas para trabajar en el repo (incluidas las de varias sesiones en paralelo)
  están en [`CLAUDE.md`](CLAUDE.md).

```bash
git switch develop && git pull
git switch -c feat/descripcion-corta
# ... commits ...
git push -u origin feat/descripcion-corta      # PR: feat/descripcion-corta → develop
# Cuando develop está listo para salir: PR develop → main, desplegar y etiquetar.
```

---

## Versiones

Se usa [versionado semántico](https://semver.org/lang/es/): `MAYOR.MENOR.PARCHE`.

- **PARCHE** (`1.0.1`): correcciones sin cambios de comportamiento visibles.
- **MENOR** (`1.1.0`): funcionalidad nueva compatible con lo que ya existe.
- **MAYOR** (`2.0.0`): cambios que obligan a cambiar cómo se trabaja o que rompen compatibilidad.

La etiqueta se pone en `main`, en el commit que quedó desplegado:

```bash
git tag -a v1.1.0 -m "GEMS 1.1.0: resumen corto"
git push origin v1.1.0
```

### 1.0.0 — 2026-09-29

Primera versión estable. Reúne la migración desde el sistema legacy, cobros por doctora con
corte de caja, receta personalizable, centro de ayuda con recorridos guiados, y el backlog de
la auditoría de flujo clínico: circuito completo de las órdenes de estudios, triage del día,
bitácora en notas SOAP, triage y pacientes, relación asistencial en las lecturas clínicas,
permisos de lectura por rol, índices de búsqueda, aviso de pacientes duplicadas y una sola
voz en la interfaz. Detalle en [`docs/auditoria/AVANCE_EJECUCION.md`](docs/auditoria/AVANCE_EJECUCION.md).

---

## Despliegue a producción

Producción usa su propio compose (`docker-compose.prod.yml`), que construye el target
`production` de cada `Dockerfile`: gunicorn para el backend y nginx sirviendo el build
estático del frontend, sin montar código ni recarga en caliente.

```bash
# 0. Configuración (solo la primera vez): copiar .env.prod.example a .env.production y llenarlo.
#    Usa SIEMPRE --env-file .env.production: el .env normal trae otra contraseña de la base
#    y tumba el stack.

# 1. Respaldo antes de tocar nada
docker exec gems_postgres_prod sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > respaldo_antes_<motivo>_<fecha>.dump

# 2. Traer main (solo fast-forward) y construir; construir no interrumpe el servicio
git fetch && git merge --ff-only origin/main
docker compose --env-file .env.production -f docker-compose.prod.yml build

# 3. Cambiar contenedores: el servicio migrate corre "alembic upgrade head" solo
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
docker exec gems_backend_prod alembic current      # debe decir (head)
```

Antes y después:

- Si `gems_clamav_prod` está `unhealthy`, el backend no arranca (depende de él):
  `docker restart gems_clamav_prod` **antes** del `up -d`.
- Si recreas solo el backend y todo el sitio da 502, nginx se quedó con la IP vieja:
  `docker restart gems_frontend_prod`.
- El `up -d` corta el servicio uno o dos minutos: hazlo fuera del horario de consulta.
- Verifica con un inicio de sesión real contra el dominio, no solo con `docker ps`.

---

## Estructura

```
GEMS/
├── backend/
│   ├── app/            # core, models, schemas, routers (≈33), services, data (catálogos)
│   ├── alembic/        # migraciones (una cadena, sin cabezas duplicadas)
│   ├── scripts/        # seed, tareas programadas, utilidades
│   └── tests/          # pytest
├── frontend/
│   └── src/
│       ├── modules/    # admin · doctor · finanzas · master · secretaria
│       └── shared/     # componentes, servicios, utilidades y tutoriales (recorridos driver.js)
├── docs/               # planes, auditoría, estado de producción, guías
├── scripts/            # verificar_todo.ps1
├── docker-compose.yml       # desarrollo
└── docker-compose.prod.yml  # producción
```

---

## Seguridad y datos clínicos

- Autenticación con JWT y contraseñas con bcrypt; freno de intentos de inicio de sesión.
- Permisos definidos en código por rol, con roles personalizados y excepciones por usuaria.
- Aislamiento por sucursal (`access_scope`) y **relación asistencial**: una doctora solo lee
  la clínica de sus pacientes.
- Bitácora (`log_action`) de las escrituras clínicas y financieras, visible en Administración →
  Auditoría.
- Archivos subidos revisados por ClamAV.
- Regla de la interfaz: **si el sistema no hizo algo, la pantalla no puede decir que sí**
  (ver [`docs/plans/22_plan_maestro_consolidado.md`](docs/plans/22_plan_maestro_consolidado.md)).

---

## Documentación

- [`CLAUDE.md`](CLAUDE.md): reglas para trabajar en el repo.
- [`docs/ESTADO_PRODUCCION.md`](docs/ESTADO_PRODUCCION.md): qué hay en producción.
- [`docs/auditoria/`](docs/auditoria/README.md): auditoría de flujo clínico y su ejecución.
- [`docs/plans/`](docs/plans/): planes de trabajo numerados.
- [`docs/guia_estilo_interfaz.md`](docs/guia_estilo_interfaz.md): voz y términos de la interfaz.
- [`BUGS.md`](BUGS.md): registro de defectos corregidos.

---

Propietario — PYANSA TI. Proyecto privado.
