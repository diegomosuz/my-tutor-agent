"""Configuración centralizada de la aplicación.

Toda la configuración se lee desde variables de entorno (ver .env.example).
Ninguna API key debe exponerse jamás al frontend: este módulo es de uso
exclusivo del backend.
"""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

from app.prompts.certification import CERTIFICATION_PROMPT_VERSION
from app.prompts.lesson import LESSON_PROMPT_VERSION


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Filesystem de cursos
    content_dir: str = "/content"

    # CORS
    frontend_origin: str = "http://localhost:5173"

    # Proveedor LLM (Fase 3: integración real)
    llm_provider: str = "pwc"
    pwc_genai_base_url: str = "https://genai-sharedservice-americas.pwcinternal.com"
    pwc_genai_api_key: str = ""
    pwc_genai_model: str = "openai.gpt-4o-2024-11-20"
    # Fallback de compatibilidad: si PWC_GENAI_API_KEY no está definida, se
    # usa GEN_AI_API_KEY (algunos entornos ya la tienen configurada así).
    gen_ai_api_key: str = ""
    openai_api_key: str = ""
    openai_model: str = ""

    # Cache local de LessonPlans generadas (filesystem, sin base de datos).
    lesson_cache_dir: str = "/app/data/lesson-cache"
    # Versión del prompt de generación de clases; forma parte de la cache
    # key. Cambiar esta versión invalida (por diseño) la cache existente.
    # El default viene de app/prompts/lesson.py (fuente única de verdad);
    # se puede sobrescribir por env var si hace falta forzar un valor.
    lesson_prompt_version: str = LESSON_PROMPT_VERSION

    # Proveedor de voz (preparado para el futuro, no se usa todavía)
    voice_provider: str = "browser"

    # Cache local de QuestionBanks de práctica de certificación (Fase 6,
    # filesystem, sin base de datos, mismo patrón que lesson_cache_dir).
    certification_cache_dir: str = "/app/data/certification-cache"
    # Versión del prompt de generación de preguntas; forma parte de la
    # cache key (ver app/services/certification_service.py). El default
    # viene de app/prompts/certification.py (fuente única de verdad).
    certification_prompt_version: str = CERTIFICATION_PROMPT_VERSION
    # Cantidad OBJETIVO de preguntas por tópico (no un mínimo absoluto: un
    # tópico corto puede devolver menos). Acotado razonablemente en el
    # servicio a un rango 1-10 sin importar este valor.
    certification_items_per_topic: int = 6

    @property
    def content_path(self) -> Path:
        return Path(self.content_dir)

    @property
    def lesson_cache_path(self) -> Path:
        return Path(self.lesson_cache_dir)

    @property
    def certification_cache_path(self) -> Path:
        return Path(self.certification_cache_dir)


@lru_cache
def get_settings() -> Settings:
    return Settings()
