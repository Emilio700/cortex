# CORTEX

Sistema clínico para un consultorio de neurocirugía: agenda, triage, consulta con
nota SOAP, expediente, recetas, órdenes de estudio, consentimientos informados,
certificados y cobros, con ayuda guiada en cada pantalla.

Cortex parte de GEMS v1.2.0 (sistema de ginecología) y lo adapta a neurocirugía:
ficha neurológica del paciente (lateralidad, implantes, anticoagulantes),
consentimientos y plantillas de estudios de neurocirugía, cirugías programadas en
el inicio del médico y una identidad visual propia.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 19, Vite, TypeScript estricto, CoreUI Pro 5, Redux, React Router 7 |
| Backend | FastAPI, SQLAlchemy 2, Alembic, Pydantic v2 |
| Base de datos | PostgreSQL 15 |
| Infraestructura | Docker Compose (desarrollo y producción) |

## Levantar en local

Cortex usa puertos propios para convivir con GEMS: base de datos **5442**, API
**8010** y web **3010**.

```bash
# 1. Base de datos
docker compose up -d postgres

# 2. Backend
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt      # en Linux/macOS: .venv/bin/pip
cp .env.example .env                                 # y ajusta DATABASE_URL al puerto 5442
.venv/Scripts/alembic upgrade head
.venv/Scripts/python -m scripts.seed_cortex          # consultorio de demostración
.venv/Scripts/uvicorn app.main:app --port 8010 --reload

# 3. Frontend
cd ../frontend
npm ci
echo "VITE_API_BASE_URL=http://127.0.0.1:8010" > .env.local
npm run dev                                          # http://localhost:3010
```

`seed_cortex` crea el consultorio «Cortex Neurocirugía» con un médico, recepción,
administración, servicios, salas, horarios, seis pacientes ficticios con
antecedentes neurológicos y citas para hoy. Imprime las contraseñas una sola vez;
para fijarlas, define `CORTEX_SEED_PASSWORD` antes de correrlo.

| Usuario | Rol |
|---|---|
| `doctor@cortexneuro.mx` | Médico (neurocirujano) |
| `recepcion@cortexneuro.mx` | Recepción |
| `admin@cortexneuro.mx` | Administración |
| `master@cortexneuro.mx` | Desarrollador |

## Verificación

```bash
cd frontend && npx tsc --noEmit && npm test
cd backend  && pytest
```

O todo junto en Windows: `powershell -File scripts/verificar_todo.ps1`.

## Estructura

```
backend/          API FastAPI (app/), migraciones (alembic/), scripts y pruebas
frontend/         SPA React (src/modules por rol, src/shared, src/scss)
docs/             DESIGN.md, guías de estilo y uso, marca (docs/marca)
scripts/          verificación local y scripts de producción
```

## Documentación

- `CLAUDE.md`: reglas de trabajo en el repo (ramas, commits, versiones, voz).
- `PROJECT_CONTEXT.md`: arquitectura y dominio.
- `docs/DESIGN.md`: sistema visual y patrones de pantalla.
- `CHANGELOG.md`: cambios por versión.
