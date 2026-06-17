import os
import secrets
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Project
    PROJECT_NAME: str = "True Data Broadband Pvt. Ltd."
    API_V1_PREFIX: str = "/api/v1"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")

    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/truedata",
    )

    # Security / JWT
    # In production a strong SECRET_KEY (or SESSION_SECRET) MUST be provided via
    # the environment — we fail closed rather than fall back to a known value.
    # In development we generate an ephemeral random key per process.
    SECRET_KEY: str = (
        os.getenv("SECRET_KEY")
        or os.getenv("SESSION_SECRET")
        or (
            secrets.token_urlsafe(64)
            if os.getenv("ENVIRONMENT", "development") != "production"
            else ""
        )
    )
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # CORS (comma separated list, or * for all)
    BACKEND_CORS_ORIGINS: str = os.getenv("BACKEND_CORS_ORIGINS", "*")

    # Storage
    STORAGE_BACKEND: str = os.getenv("STORAGE_BACKEND", "local")
    STORAGE_ROOT: str = os.getenv("STORAGE_ROOT", "storage")

    # Public base URL — used to build absolute links in emails (logo, etc.)
    # Set SITE_URL in the environment for deployed instances.
    # On Replit dev this is auto-detected from REPLIT_DEV_DOMAIN.
    SITE_URL: str = os.getenv(
        "SITE_URL",
        (
            f"https://{os.getenv('REPLIT_DEV_DOMAIN')}"
            if os.getenv("REPLIT_DEV_DOMAIN")
            else ""
        ),
    )

    # Seed user
    SEED_ADMIN_EMAIL: str = os.getenv("SEED_ADMIN_EMAIL", "admin@truedatabroadband.com")
    SEED_ADMIN_PASSWORD: str = os.getenv("SEED_ADMIN_PASSWORD", "TrueData@123")

    @property
    def cors_origins(self) -> list[str]:
        if self.BACKEND_CORS_ORIGINS.strip() == "*":
            return ["*"]
        return [o.strip() for o in self.BACKEND_CORS_ORIGINS.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if settings.is_production and not settings.SECRET_KEY:
        raise RuntimeError(
            "SECRET_KEY (or SESSION_SECRET) must be set in the environment "
            "when ENVIRONMENT=production."
        )
    return settings


settings = get_settings()
