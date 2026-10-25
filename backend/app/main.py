"""FastAPI application entry point"""

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errores_validacion import resumen, traducir_errores
from app.core.request_context import bind_request_context, reset_request_context
from app.core.deps import PERMISSIONS_VERSION_HEADER, get_db
from app.core.version import APP_VERSION
from app.core.scheduler import shutdown_scheduler, start_scheduler
from app.services.cobro_service import CobroDobleError
from app.routers import (
    audit_logs,
    appointment_reminders,
    appointments,
    auth,
    clinical_consents,
    clinical_episodes,
    clinical_images,
    clinical_tracking,
    consulta_en_curso,
    consultation_rooms,
    custom_roles,
    doctor_clinics,
    doctor_profile,
    doctor_schedule,
    imaging,
    imaging_compartir,
    medical_certificates,
    medications,
    notifications,
    patient_care_team,
    patient_documents,
    patient_preregistration,
    patients,
    payments,
    permissions,
    prenatal,
    prescriptions,
    reports,
    resumen_clinico,
    expediente,
    estudios_externos,
    imagenes,
    services,
    soap_notes,
    specialty,
    tenants,
    triage,
    users,
    catalogo_estudios,
)
# Escalas neurológicas (Cortex, feat/escalas-neuro)
from app.routers import escalas as escalas_router
# Columna desde radiografías (Cortex, feat/columna-desde-radiografias)
from app.routers import columna_rx as columna_rx_router
# base-modulos-extra (tramo A): módulos opcionales y estado de servicios.
from app.routers import modulos as modulos_router


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Start the in-process scheduler only when this process owns that role."""
    # Deja registrado el límite efectivo del freno de login (B-10): con varios
    # workers el límite real es por proceso × workers, no el configurado.
    import logging

    from app.core.rate_limit import effective_cross_worker_limit

    logging.getLogger(__name__).info(
        "Freno de login: %s intentos/%ss por proceso; con %s worker(s) el límite "
        "efectivo por IP es de hasta %s por ventana.",
        settings.LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
        settings.LOGIN_RATE_LIMIT_WINDOW_SECONDS,
        settings.WEB_CONCURRENCY,
        effective_cross_worker_limit(),
    )
    if settings.SCHEDULER_ENABLED:
        start_scheduler()
    yield
    if settings.SCHEDULER_ENABLED:
        shutdown_scheduler()


# Create FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    description="Gynecology & Expert Management System - Medical SaaS Platform",
    version=APP_VERSION,
    lifespan=lifespan,
)


@app.exception_handler(RequestValidationError)
async def errores_de_validacion_en_espanol(
    _request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Devuelve los 422 de Pydantic en español y nombrando el campo.

    Pydantic corta la petición antes de que el router se ejecute, así que sus
    textos ("Field required", "Input should be a valid integer") no se pueden
    traducir router por router: se traducen aquí, una sola vez, por el `type`
    del error.

    La **forma** de la respuesta no cambia: ``detail`` sigue siendo la lista al
    estilo de Pydantic que ya sabe leer ``frontend/src/shared/utils/errors.ts``,
    con su ``loc`` y su ``type`` intactos para quien tenga que depurar. Lo que
    cambia es el ``msg``. Se añade además ``mensaje`` con todos los fallos en
    una sola frase, para las pantallas que los pintan de un tirón.
    """
    traducidos = traducir_errores(exc.errors())
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": traducidos, "mensaje": resumen(traducidos)},
    )


@app.exception_handler(CobroDobleError)
async def cobro_doble(_request: Request, exc: CobroDobleError) -> JSONResponse:
    """409 de cobro doble (plan 23).

    ``detail`` se queda como texto plano, igual que cualquier otro error, para
    que la pantalla lo muestre sin tratarlo aparte; ``cobro_existente`` va al
    lado con el pago que ya existe, para poder enseñarlo sin otra llamada.
    """
    contenido = {"detail": exc.detalle, "cobro_existente": exc.cobro_existente}
    if exc.cita_existente is not None:
        contenido["cita_existente"] = exc.cita_existente
    return JSONResponse(status_code=status.HTTP_409_CONFLICT, content=contenido)


@app.middleware("http")
async def privacy_preserving_audit_context(request: Request, call_next):
    token = bind_request_context(request)
    try:
        return await call_next(request)
    finally:
        reset_request_context(token)

# Configure CORS
# Origins are driven by the CORS_ORIGINS env var (see app.core.config). Common
# local dev origins are only added automatically in the development environment
# so production stays restricted to what is explicitly configured.
origins = settings.cors_origins_list

if settings.ENVIRONMENT == "development":
    dev_origins = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ]
    origins.extend(origin for origin in dev_origins if origin not in origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # Sin esto el navegador recibe X-Permissions-Version pero no deja que el
    # frontend lo lea, y la sesion nunca se entera de que sus permisos
    # cambiaron. allow_headers es lo que el navegador puede mandar; esto es lo
    # que puede leer de la respuesta. X-Total-Count es el total de las listas
    # paginadas (historial de estudios, recetas, certificados): sin exponerlo
    # la pantalla no sabe si hay más páginas cuando la API está en otro origen.
    # X-Order-Ids: qué órdenes salieron en el papel consolidado, para
    # registrar la impresión real (plan 26, M5).
    # X-Folio y X-Vista-Previa: el folio del resumen clínico emitido y la
    # constancia de que se vio la vista previa (plan 32, punto 8).
    # Content-Disposition: el nombre del archivo, para que la descarga se
    # llame como el folio impreso cuando la API está en otro origen.
    expose_headers=[PERMISSIONS_VERSION_HEADER, "X-Total-Count", "X-Order-Ids", "X-Folio", "X-Vista-Previa", "Content-Disposition", "X-Resultados-En-Estudios"],
)

# Register routers under the versioned API prefix. Only /health and / stay
# unprefixed, following the common convention of keeping infra probes and the
# root landing endpoint stable across API versions.
app.include_router(auth.router, prefix=settings.API_V1_PREFIX)
app.include_router(audit_logs.router, prefix=settings.API_V1_PREFIX)
app.include_router(users.router, prefix=settings.API_V1_PREFIX)
app.include_router(appointments.router, prefix=settings.API_V1_PREFIX)
app.include_router(consulta_en_curso.router, prefix=settings.API_V1_PREFIX)
app.include_router(patients.router, prefix=settings.API_V1_PREFIX)
app.include_router(patient_care_team.router, prefix=settings.API_V1_PREFIX)
app.include_router(clinical_episodes.router, prefix=settings.API_V1_PREFIX)
app.include_router(prenatal.router, prefix=settings.API_V1_PREFIX)
app.include_router(clinical_tracking.router, prefix=settings.API_V1_PREFIX)
app.include_router(clinical_images.router, prefix=settings.API_V1_PREFIX)
app.include_router(clinical_consents.router, prefix=settings.API_V1_PREFIX)
app.include_router(triage.router, prefix=settings.API_V1_PREFIX)
app.include_router(soap_notes.router, prefix=settings.API_V1_PREFIX)
app.include_router(prescriptions.router, prefix=settings.API_V1_PREFIX)
app.include_router(medical_certificates.router, prefix=settings.API_V1_PREFIX)
app.include_router(patient_documents.router, prefix=settings.API_V1_PREFIX)
app.include_router(doctor_profile.router, prefix=settings.API_V1_PREFIX)
app.include_router(services.router, prefix=settings.API_V1_PREFIX)
app.include_router(payments.router, prefix=settings.API_V1_PREFIX)
app.include_router(reports.router, prefix=settings.API_V1_PREFIX)
app.include_router(notifications.router, prefix=settings.API_V1_PREFIX)
app.include_router(appointment_reminders.router, prefix=settings.API_V1_PREFIX)
app.include_router(custom_roles.router, prefix=settings.API_V1_PREFIX)
app.include_router(doctor_schedule.router, prefix=settings.API_V1_PREFIX)
app.include_router(specialty.router, prefix=settings.API_V1_PREFIX)
app.include_router(patient_preregistration.router, prefix=settings.API_V1_PREFIX)
app.include_router(permissions.router, prefix=settings.API_V1_PREFIX)
app.include_router(medications.router, prefix=settings.API_V1_PREFIX)
app.include_router(catalogo_estudios.router, prefix=settings.API_V1_PREFIX)
app.include_router(tenants.router, prefix=settings.API_V1_PREFIX)
app.include_router(consultation_rooms.router, prefix=settings.API_V1_PREFIX)
app.include_router(doctor_clinics.router, prefix=settings.API_V1_PREFIX)
app.include_router(resumen_clinico.router, prefix=settings.API_V1_PREFIX)
app.include_router(expediente.router, prefix=settings.API_V1_PREFIX)
app.include_router(estudios_externos.router, prefix=settings.API_V1_PREFIX)
app.include_router(imagenes.router, prefix=settings.API_V1_PREFIX)
app.include_router(imaging.router, prefix=settings.API_V1_PREFIX)
app.include_router(imaging_compartir.router, prefix=settings.API_V1_PREFIX)
app.include_router(imaging_compartir.router_publico, prefix=settings.API_V1_PREFIX)
# Escalas neurológicas (Cortex, feat/escalas-neuro)
app.include_router(escalas_router.router, prefix=settings.API_V1_PREFIX)
# Columna desde radiografías (Cortex, feat/columna-desde-radiografias)
app.include_router(columna_rx_router.router, prefix=settings.API_V1_PREFIX)
# base-modulos-extra (tramo A): módulos opcionales y estado de servicios.
app.include_router(modulos_router.router, prefix=settings.API_V1_PREFIX)
app.include_router(modulos_router.router_servicios, prefix=settings.API_V1_PREFIX)


@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "cortex-backend"}


@app.get("/ready")
def readiness_check(db: Session = Depends(get_db)):
    """Readiness probe: process is useful only when its database responds."""
    db.execute(text("SELECT 1"))
    return {"status": "ready", "database": "reachable"}


@app.get("/")
def root():
    """Root endpoint"""
    return {
        "message": "CORTEX API",
        "version": APP_VERSION,
        "docs": "/docs",
        "health": "/health",
    }
