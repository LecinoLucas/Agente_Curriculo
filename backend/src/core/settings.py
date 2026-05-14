from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Application
    APP_ENV: str = "development"
    APP_SECRET_KEY: str
    FIELD_ENCRYPTION_KEY: str = ""
    APP_DEBUG: bool = False
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    # Database
    DATABASE_URL: str
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20
    DATABASE_POOL_TIMEOUT: int = 30

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_MAX_CONNECTIONS: int = 20

    # JWT
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # S3
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_REGION: str = "us-east-1"
    S3_BUCKET_NAME: str = "resume-ai-files"
    S3_PRESIGNED_URL_EXPIRE_SECONDS: int = 900

    # AI
    AI_PROVIDER: str = "anthropic"
    AI_MODEL_ID: str = "gemini-2.5-flash"
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_DEFAULT_MODEL: str = "claude-sonnet-4-6"
    ANTHROPIC_MAX_TOKENS: int = 4096
    GOOGLE_API_KEY_1: str = ""
    GOOGLE_API_KEY_2: str = ""
    GOOGLE_API_KEY_3: str = ""
    GOOGLE_API_KEY_4: str = ""
    GOOGLE_API_KEY_5: str = ""
    GEMINI_API_BASE_URL: str = "https://generativelanguage.googleapis.com/v1beta"
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    PUBLIC_API_BASE_URL: str = ""
    FRONTEND_BASE_URL: str = ""
    GOOGLE_REDIRECT_URI: str = ""
    GOOGLE_CALENDAR_SCOPES: str = "openid email profile https://www.googleapis.com/auth/calendar.events"
    ALLOW_AI_TOKEN_SPEND: bool = True
    # Set to true ONLY in local dev to bypass real AI calls with synthetic scores.
    # Must never be true in staging or production.
    ENABLE_DEV_MOCK: bool = False
    # AI Provider configuration
    AI_PROVIDER_TIMEOUT_SECONDS: float = 90.0
    AI_MAX_TOKENS: int = 4000
    AI_MAX_RETRIES: int = 3
    AI_ANALYSIS_MAX_OUTPUT_TOKENS: int = 1200
    AI_ANALYSIS_MAX_RESUME_CHARS: int = 4500
    AI_ANALYSIS_MAX_JOB_CHARS: int = 1800
    AI_ANALYSIS_RATE_LIMIT_COOLDOWN_SECONDS: int = 300
    GEMINI_DEBUG_LOG_FULL_CONTENT: bool = False
    GEMINI_MAX_CONCURRENT_REQUESTS: int = 2
    GEMINI_CONCURRENCY_WAIT_TIMEOUT_SECONDS: float = 30.0
    GEMINI_CONCURRENCY_RETRY_INTERVAL_MS: int = 200
    GEMINI_CONCURRENCY_SLOT_TTL_SECONDS: int = 300
    SKILL_CATALOG_SOURCE: str = "database"
    SKILL_CATALOG_COMPARE_ON_MATCH: bool = False
    ERP_INTEGRATION_MODE: str = "dry_run"

    # Celery
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"
    MATCHING_AUTO_FANOUT_LIMIT: int = 25

    # Monitoring
    SENTRY_DSN: str = ""

    @field_validator("APP_ENV")
    @classmethod
    def validate_env(cls, v: str) -> str:
        allowed = {"development", "staging", "production"}
        if v not in allowed:
            raise ValueError(f"APP_ENV must be one of {allowed}")
        return v

    @field_validator("AI_PROVIDER")
    @classmethod
    def validate_ai_provider(cls, v: str) -> str:
        normalized = v.strip().lower()
        allowed = {"anthropic", "google"}
        if normalized not in allowed:
            raise ValueError(f"AI_PROVIDER must be one of {allowed}")
        return normalized

    @field_validator("SKILL_CATALOG_SOURCE")
    @classmethod
    def validate_skill_catalog_source(cls, v: str) -> str:
        normalized = v.strip().lower()
        allowed = {"json", "database"}
        if normalized not in allowed:
            raise ValueError(f"SKILL_CATALOG_SOURCE must be one of {allowed}")
        return normalized

    @field_validator("ERP_INTEGRATION_MODE")
    @classmethod
    def validate_erp_integration_mode(cls, v: str) -> str:
        normalized = v.strip().lower()
        allowed = {"disabled", "dry_run", "mock", "real"}
        if normalized not in allowed:
            raise ValueError(f"ERP_INTEGRATION_MODE must be one of {allowed}")
        return normalized

    def model_post_init(self, __context: object) -> None:
        if self.ENABLE_DEV_MOCK and self.APP_ENV == "production":
            raise ValueError("ENABLE_DEV_MOCK must not be enabled in production")

        if self.APP_ENV == "production" and not self.FIELD_ENCRYPTION_KEY:
            raise ValueError("FIELD_ENCRYPTION_KEY must be set in production")

        if not self.FIELD_ENCRYPTION_KEY and self.APP_ENV != "production":
            # Fallback para dev/test (chave estática válida para Fernet)
            self.FIELD_ENCRYPTION_KEY = "cuZ9dlSKhIokW-5fid9qSCsFJEoc2swn9iZNupnF06w="

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"

    @property
    def jwt_refresh_expire_seconds(self) -> int:
        return self.JWT_REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600

    @property
    def public_api_base_url(self) -> str:
        if self.PUBLIC_API_BASE_URL:
            return self.PUBLIC_API_BASE_URL.rstrip("/")
        return "http://127.0.0.1:8000"

    @property
    def frontend_base_url(self) -> str:
        if self.FRONTEND_BASE_URL:
            return self.FRONTEND_BASE_URL.rstrip("/")
        if self.CORS_ORIGINS:
            return self.CORS_ORIGINS[0].rstrip("/")
        return "http://127.0.0.1:5173"

    @property
    def google_redirect_uri(self) -> str:
        if self.GOOGLE_REDIRECT_URI:
            return self.GOOGLE_REDIRECT_URI
        return f"{self.public_api_base_url}/api/v1/integrations/google-calendar/callback"

    @property
    def google_api_keys(self) -> list[str]:
        return [
            key.strip()
            for key in (
                self.GOOGLE_API_KEY_1,
                self.GOOGLE_API_KEY_2,
                self.GOOGLE_API_KEY_3,
                self.GOOGLE_API_KEY_4,
                self.GOOGLE_API_KEY_5,
            )
            if key.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


settings = get_settings()
