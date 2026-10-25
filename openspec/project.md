# Cortex · contexto del proyecto para OpenSpec

## Qué es

Cortex es el sistema clínico de un consultorio de neurocirugía: agenda, triage,
consulta SOAP, expediente, recetas, órdenes de estudio, estudios de imagen DICOM,
consentimientos y cobros. Nació como copia de GEMS v1.2.0 (ginecología) y se adaptó
a neurocirugía; lo ginecológico se conserva en la base, pero no se ofrece.

## Tecnología

- **Backend:** FastAPI + SQLAlchemy + Alembic sobre PostgreSQL (`backend/`).
  Pruebas con pytest sobre SQLite en memoria.
- **Frontend:** React + TypeScript + CoreUI con Vite (`frontend/`). Pruebas con
  vitest y Testing Library.
- **Infraestructura:** Docker Compose. Los servicios auxiliares van en perfiles
  (`imagen`, `ia`) para que `docker compose up -d postgres` siga igual.

## Convenciones que toda propuesta respeta

- **Idioma:** comentarios, pruebas y textos en español con acentos. Voz en
  masculino genérico («el paciente», «el médico») y de tú a quien usa el sistema.
- **Ramas:** `feat/`, `fix/`, `refactor/`, `chore/`, `docs/` desde `develop`. El
  cambio de OpenSpec se llama como la rama, sin el prefijo.
- **Datos:** las migraciones solo agregan; cada una tiene `downgrade` y, cuando
  toca tablas, su prueba de ida y vuelta. Apagar o retirar una función nunca
  borra información clínica.
- **Permisos:** cada acción nueva va en `backend/app/models/permission.py` y en
  `MODULE_HIERARCHY` del frontend. Las escrituras sensibles van a la bitácora
  (`audit_service.log_action`).
- **Interfaz:** se sigue `docs/DESIGN.md` y los tokens `--cx-*`. Una pantalla nueva
  trae su recorrido guiado en `frontend/src/shared/tutoriales/recorridos/` y nunca
  se abre sola.
- **Regla clínica:** si el sistema no hizo algo, la interfaz no puede decir que sí.

## Estructura

```
openspec/
  project.md            este archivo
  specs/                especificaciones vigentes del sistema (se llenan al archivar cambios)
  changes/<cambio>/     propuesta (proposal.md) y tareas (tasks.md) de cada cambio
```
