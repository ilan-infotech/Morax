from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "MORAX Labour Compliance API"
    api_v1_prefix: str = "/api/v1"
    database_url: str = "sqlite:///./morax.db"
    jwt_secret_key: str = "change-this-before-production"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 480
    # Support both common local Vite origins. Production must replace this
    # with the exact deployed frontend origin(s).
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    cors_origin_regex: str | None = r"^https?://(localhost|127\.0\.0\.1):\d+$"
    upload_dir: str = "./uploads"
    max_upload_bytes: int = 10 * 1024 * 1024
    bootstrap_admin_email: str = "admin@morax.example.com"
    bootstrap_admin_password: str = "Admin@123"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def upload_path(self) -> Path:
        return Path(self.upload_dir).resolve()

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
