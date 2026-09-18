"""Interfaz de proveedores LLM.

IMPORTANTE: en esta fase (Fase 1) NO se realiza ninguna llamada real a
ningún proveedor LLM. Este módulo solo define la interfaz y el esqueleto
para que las próximas fases puedan implementar la integración real sin
rediseñar el backend.

Regla de grounding (ver CLAUDE.md): cualquier implementación futura de
estos providers debe construir sus respuestas EXCLUSIVAMENTE a partir del
contenido Markdown del tópico correspondiente. Nunca debe incorporar
conocimiento externo al material del curso.
"""
from __future__ import annotations

from abc import ABC, abstractmethod

from app.config import Settings


class LLMProvider(ABC):
    """Contrato común para cualquier proveedor de LLM."""

    @abstractmethod
    def is_configured(self) -> bool:
        """Indica si el proveedor tiene las credenciales necesarias."""
        raise NotImplementedError


class PwCGenAIProvider(LLMProvider):
    """Proveedor interno PwC GenAI (Fase futura: no implementado aún)."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def is_configured(self) -> bool:
        return bool(self._settings.pwc_genai_api_key)


class OpenAIProvider(LLMProvider):
    """Proveedor OpenAI (Fase futura: no implementado aún)."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def is_configured(self) -> bool:
        return bool(self._settings.openai_api_key)


def get_llm_provider(settings: Settings) -> LLMProvider:
    """Factory que selecciona el proveedor según LLM_PROVIDER.

    No se invoca todavía en ningún endpoint de Fase 1.
    """
    if settings.llm_provider == "openai":
        return OpenAIProvider(settings)
    return PwCGenAIProvider(settings)
