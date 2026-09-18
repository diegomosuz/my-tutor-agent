"""Configuración centralizada de la aplicación.

Toda la configuración se lee desde variables de entorno (ver .env.example).
Ninguna API key debe exponerse jamás al frontend: este módulo es de uso
exclusivo del backend.
"""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Filesystem de cursos
    content_dir: str = "/content"

    # CORS
    frontend_origin: str = "http://localhost:5173"

    # Proveedor LLM (preparado para el futuro, no se usa todavía en Fase 1)
    llm_provider: str = "pwc"
    pwc_genai_base_url: str = "https://genai-sharedservice-americas.pwcinternal.com"
    pwc_genai_api_key: str = ""
    pwc_genai_model: str = "openai.gpt-4o-2024-11-20"
    openai_api_key: str = ""
    openai_model: str = ""

    # Proveedor de voz (preparado para el futuro, no se usa todavía)
    voice_provider: str = "browser"

    @property
    def content_path(self) -> Path:
        return Path(self.content_dir)


@lru_cache
def get_settings() -> Settings:
    return Settings()
