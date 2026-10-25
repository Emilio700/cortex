"""Application configuration using Pydantic Settings"""

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# «ninguno» no llama a nadie y Ollama corre en la red local sin llave.
PROVEEDORES_IA_SIN_LLAVE = frozenset({"ninguno", "ollama"})


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    # Database
    DATABASE_URL: str

    # Security
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    # MFA queda desactivado por defecto (cadena vacia = ningun rol lo exige).
    # Se reactiva sin tocar codigo poniendo, por ejemplo,
    # MFA_REQUIRED_ROLES=master,admin,doctor en el entorno.
    MFA_REQUIRED_ROLES: str = ""
    MFA_ISSUER: str = "CORTEX"

    # CORS
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    # Public URL of the frontend (used to build links inside emails, e.g. the
    # password reset link). Must point at the real domain in production or the
    # user receives a link to localhost that only works on the server itself.
    FRONTEND_URL: str = "http://localhost:3000"

    # Sucursales (tenants). El tope es configuracion, no un numero magico:
    # subir el limite es cambiar MAX_TENANTS en el entorno, sin tocar codigo.
    MAX_TENANTS: int = 5

    # appointments.scheduled_at guarda hora LOCAL del consultorio y el
    # contenedor corre en UTC: sin esto los recordatorios salen desfasados.
    CLINIC_TIMEZONE: str = "America/Mazatlan"

    # Application
    APP_NAME: str = "CORTEX"
    API_V1_PREFIX: str = "/api/v1"
    ENVIRONMENT: str = "development"
    # Run APScheduler only in the dedicated scheduler process in production.
    # Keeping it enabled by default preserves the single-process development
    # workflow, while production explicitly disables it on Gunicorn workers.
    SCHEDULER_ENABLED: bool = True

    # Límite de intentos de login por IP (freno a la fuerza bruta, B-10). Es
    # configurable para poder ajustarlo sin tocar código. El límite es POR
    # PROCESO: con varios workers de Gunicorn el límite efectivo entre todos es
    # ``LOGIN_RATE_LIMIT_MAX_ATTEMPTS × WEB_CONCURRENCY`` (ver app.core.rate_limit).
    # ``WEB_CONCURRENCY`` debe reflejar el nº de workers reales (el Dockerfile de
    # producción arranca Gunicorn con -w 4, así que en PROD se pone en 4).
    LOGIN_RATE_LIMIT_MAX_ATTEMPTS: int = 5
    LOGIN_RATE_LIMIT_WINDOW_SECONDS: int = 60
    WEB_CONCURRENCY: int = 1
    # Backend del limitador: "memory" (por proceso, el actual) es el único
    # implementado. Es el gancho para uno compartido entre workers: cuando haya
    # un almacén compartido garantizado en PROD (Redis, o una tabla en el
    # Postgres que ya existe), aquí se selecciona sin tocar los routers.
    RATE_LIMIT_BACKEND: str = "memory"

    # Clinical file protection and scalable storage. Local storage remains
    # useful for development; production can switch to S3-compatible object
    # storage without changing routers.
    STORAGE_BACKEND: str = "local"
    UPLOAD_DIR: str = "uploads"
    S3_BUCKET: str = ""
    S3_ENDPOINT_URL: str = ""
    S3_REGION: str = ""
    S3_ACCESS_KEY_ID: str = ""
    S3_SECRET_ACCESS_KEY: str = ""
    ANTIVIRUS_ENABLED: bool = False
    ANTIVIRUS_REQUIRED: bool = False
    CLAMAV_HOST: str = "clamav"
    CLAMAV_PORT: int = 3310
    CLAMAV_TIMEOUT_SECONDS: float = 15.0

    # Email (Fase 4.2) - generic SMTP, works with any provider (Gmail,
    # SendGrid, Postmark, Mailtrap, ...) without tying the code to one
    # vendor's SDK. EMAIL_ENABLED defaults to False so a dev environment
    # without SMTP credentials configured doesn't error out - sends are
    # logged instead of attempted (see app.services.email_service).
    EMAIL_ENABLED: bool = False
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_USE_TLS: bool = True
    EMAIL_FROM_ADDRESS: str = "no-reply@gems.local"
    EMAIL_FROM_NAME: str = "CORTEX"

    # Servicios auxiliares de los módulos extra (base-modulos-extra). Todos son
    # opcionales: vacío significa «no instalado» y el módulo que lo necesita no
    # se deja encender. Así un consultorio sin Orthanc ni IA arranca igual.
    ORTHANC_URL: str = ""
    ORTHANC_USUARIO: str = ""
    ORTHANC_PASSWORD: str = ""
    WHISPER_URL: str = ""
    PRESIDIO_URL: str = ""
    SEGMENTADOR_URL: str = ""
    # Proveedor de IA: «ninguno» (plantillas sin modelo), «ollama» (local, sin
    # llave), «deepseek», «anthropic»… Cambiar de modelo es cambiar esto, no código.
    IA_PROVEEDOR: str = "ninguno"
    IA_MODELO: str = ""
    IA_BASE_URL: str = ""
    IA_API_KEY: str = ""

    # A deployment .env also contains Compose-only variables (POSTGRES_USER,
    # IMAGE_TAG, VITE_API_BASE_URL, etc.). They must not prevent the API from
    # starting merely because they are not Settings fields.
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")

    @model_validator(mode="after")
    def validate_production_safety(self):
        if self.ENVIRONMENT != "production":
            return self
        if len(self.SECRET_KEY) < 32 or "change-me" in self.SECRET_KEY.lower():
            raise ValueError(
                "Production SECRET_KEY must be a strong value of at least 32 characters"
            )
        origins = self.cors_origins_list
        if not origins or "*" in origins or any("localhost" in item for item in origins):
            raise ValueError("Production CORS_ORIGINS must contain exact public origins")
        if "localhost" in self.FRONTEND_URL or not self.FRONTEND_URL.startswith("https://"):
            raise ValueError("Production FRONTEND_URL must be a public HTTPS URL")
        if self.ANTIVIRUS_REQUIRED and not self.ANTIVIRUS_ENABLED:
            raise ValueError("Production antivirus is required but ANTIVIRUS_ENABLED is false")
        if self.STORAGE_BACKEND == "s3" and not self.S3_BUCKET:
            raise ValueError("S3_BUCKET is required when STORAGE_BACKEND=s3")
        # Un proveedor remoto sin llave fallaría a media consulta; mejor que la
        # API no arranque y el error se vea al desplegar.
        if self.ia_proveedor not in PROVEEDORES_IA_SIN_LLAVE and not self.IA_API_KEY:
            raise ValueError("IA_API_KEY is required when IA_PROVEEDOR is a remote provider")
        return self

    @property
    def ia_proveedor(self) -> str:
        return (self.IA_PROVEEDOR or "ninguno").strip().lower()

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse CORS origins from comma-separated string"""
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]

    @property
    def mfa_required_roles(self) -> set[str]:
        return {role.strip().lower() for role in self.MFA_REQUIRED_ROLES.split(",") if role.strip()}


# Global settings instance
settings = Settings()
