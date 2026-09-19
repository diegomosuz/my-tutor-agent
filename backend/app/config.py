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

    # Versión de aplicación, informativa únicamente (Fase 7, sección 17).
    # No hay automatización de semver: se bumpea a mano al final de cada
    # fase relevante.
    app_version: str = "1.0.1"

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

    # Proveedor de voz (Fase 7). "auto": usa OpenAI TTS si está configurado,
    # si no cae a Web Speech API del navegador. "browser": fuerza Web
    # Speech, nunca llama a OpenAI. "openai": intenta OpenAI TTS y, si
    # falla, ofrece fallback de navegador (nunca rompe la clase).
    voice_provider: str = "auto"
    openai_tts_model: str = "gpt-4o-mini-tts"
    openai_tts_voice: str = "marin"
    # Instructions por defecto si no se configura ninguna explícita: solo
    # controla INTERPRETACIÓN VOCAL, nunca el contenido pedagógico (el
    # texto sintetizado ya viene validado/grounded desde antes — ver
    # SpeechService, sección 23 de la especificación de Fase 7).
    openai_tts_instructions: str = (
        "Hablar en español claro, profesional y natural. Mantener "
        "correctamente los términos técnicos en su idioma original. Usar "
        "ritmo de explicación de clase, no de publicidad."
    )
    speech_cache_dir: str = "/app/data/speech-cache"

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

    @property
    def speech_cache_path(self) -> Path:
        return Path(self.speech_cache_dir)

    @property
    def data_path(self) -> Path:
        """Directorio raíz de datos escribibles (lesson-cache/
        certification-cache/speech-cache viven todos debajo de acá). Usado
        por /api/ready para verificar permisos de escritura."""
        return Path(self.lesson_cache_dir).parent


@lru_cache
def get_settings() -> Settings:
    return Settings()
