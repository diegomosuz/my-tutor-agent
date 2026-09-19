"""Proveedores LLM (Fase 3: integración real).

Contrato mínimo (`LLMProvider.generate_structured`) para que
`app/services/lesson_generator.py` no conozca ningún detalle de
autenticación/transporte HTTP específico de PwC ni de OpenAI. El servicio
pedagógico solo sabe que le pide a un `LLMProvider` que genere un objeto
Pydantic a partir de una lista de mensajes; cómo se autentica y parsea la
respuesta es responsabilidad exclusiva de cada implementación.

Regla de grounding (ver CLAUDE.md): ningún provider decide QUÉ contenido
pedagógico se envía — eso lo arma `app/prompts/lesson.py` a partir
exclusivamente del Grounding Packet del tópico (Fase 2). Los providers solo
transportan esos mensajes al modelo y devuelven una respuesta estructurada;
la validación de grounding ocurre después, en
`app/services/lesson_validation.py`.

Manejo de errores: se define una jerarquía chica y explícita en vez de
dejar pasar excepciones crudas del SDK/HTTP, para que el router pueda
traducirlas a códigos HTTP claros sin filtrar secretos (ver
`app/routers/courses.py`):

- `LLMConfigurationError`: configuración inválida (provider desconocido,
  falta credencial, falta modelo). No debe reintentarse.
- `LLMAuthError`: credencial rechazada por el proveedor (401/403). No debe
  reintentarse.
- `LLMUpstreamError`: error recuperable del proveedor externo — nunca hubo
  una respuesta HTTP completa que procesar (timeout, error de conexión,
  5xx). Reintentable con límite.
- `LLMResponseError`: el proveedor SÍ respondió (HTTP 200 incluido), pero
  el contenido no tiene la forma esperada — JSON inválido, `choices`
  vacío, `message.content` ausente, refusal, structured output truncado
  (`finish_reason=length`) o bloqueado por content filter, o cualquier
  excepción no reconocida que ocurra durante el parseo/validación local
  del SDK después de la llamada de red. Reintentable con límite (vía
  mensaje de corrección).

Regla dura (bug real corregido en v1.0.1, ver `docs/RELEASE_NOTES_v1.0.1.md`):
un HTTP 200 que después no cumple el contrato NUNCA debe clasificarse como
`LLMUpstreamError` — `LLMUpstreamError` es exclusivamente para cuando la
llamada de red en sí falló (timeout/conexión/5xx), nunca para problemas de
parseo/schema que ocurren sobre una respuesta ya recibida.

Ninguna excepción de este módulo debe incluir la API key ni el header
`Authorization` en su mensaje.
"""
from __future__ import annotations

import json
import re
from abc import ABC, abstractmethod
from typing import TypeVar

import httpx
from pydantic import BaseModel

from app.config import Settings

ModelT = TypeVar("ModelT", bound=BaseModel)

# Timeouts explícitos (segundos). La generación de una lección implica una
# respuesta larga (varias escenas), por eso el timeout es más generoso que
# el de una llamada de API convencional.
_PWC_REQUEST_TIMEOUT_SECONDS = 90.0
_OPENAI_REQUEST_TIMEOUT_SECONDS = 90.0

_JSON_FENCE_RE = re.compile(r"^```(?:json)?\s*\n(.*)\n```\s*$", re.DOTALL)


class LLMProviderError(Exception):
    """Error controlado de un provider LLM. Nunca debe contener la API key
    ni el header Authorization en su mensaje."""


class LLMConfigurationError(LLMProviderError):
    """Configuración inválida: provider desconocido, credencial o modelo
    ausente. No debe reintentarse."""


class LLMAuthError(LLMProviderError):
    """Credencial rechazada por el proveedor (401/403). No debe
    reintentarse."""


class LLMUpstreamError(LLMProviderError):
    """Error recuperable del proveedor externo (timeout, conexión, 5xx).
    Reintentable con límite."""


class LLMResponseError(LLMProviderError):
    """La respuesta del proveedor no tiene la forma esperada (JSON
    inválido, choices vacío, message.content ausente, refusal, etc.).
    Reintentable con límite (vía mensaje de corrección)."""


def _strip_json_fence(content: str) -> str:
    content = content.strip()
    match = _JSON_FENCE_RE.match(content)
    if match:
        return match.group(1).strip()
    return content


def parse_structured_json(content: str, response_model: type[ModelT]) -> ModelT:
    """Parsea `content` (texto de un LLM que debía responder JSON puro)
    contra `response_model`.

    Acepta opcionalmente el JSON envuelto en un único fence ```json ... ```
    (se quita antes de parsear). NO se implementan heurísticas para
    extraer JSON arbitrario mezclado con prosa: si el contenido no puede
    parsearse limpiamente después de quitar el fence, se considera
    inválido (ver Fase 3, sección "Parseo del resultado PwC").
    """
    text = _strip_json_fence(content)
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise LLMResponseError(
            f"La respuesta del proveedor no es JSON válido: {exc}"
        ) from exc
    return response_model.model_validate(data)


class LLMProvider(ABC):
    """Contrato común para cualquier proveedor de LLM."""

    #: Identificador corto y estable ("pwc" | "openai"). Se usa como parte
    #: de la cache key de LessonPlan y se expone en GET /api/ai/status.
    name: str

    @abstractmethod
    def is_configured(self) -> bool:
        """Indica si el proveedor tiene la credencial necesaria. Debe
        poder llamarse sin lanzar excepciones incluso si no hay ninguna
        credencial configurada (la app debe poder arrancar sin ella)."""
        raise NotImplementedError

    @property
    @abstractmethod
    def model(self) -> str:
        """Nombre del modelo configurado para este proveedor."""
        raise NotImplementedError

    @abstractmethod
    def generate_structured(
        self, *, messages: list[dict[str, str]], response_model: type[ModelT]
    ) -> ModelT:
        """Genera contenido y lo devuelve validado contra `response_model`.

        `messages` sigue el formato Chat Completions
        (`[{"role": "system"|"user", "content": "..."}]`). La
        implementación es responsable de llamar al proveedor real, parsear
        la respuesta y validarla contra `response_model` — esta validación
        es ADEMÁS de cualquier validación propia del SDK del proveedor,
        nunca la sustituye: la app siempre revalida por su cuenta.

        Debe lanzar una de las excepciones de este módulo
        (`LLMConfigurationError`, `LLMAuthError`, `LLMUpstreamError`,
        `LLMResponseError`) ante cualquier problema; nunca dejar pasar una
        excepción cruda del SDK/HTTP subyacente.
        """
        raise NotImplementedError


class PwCGenAIProvider(LLMProvider):
    """Proveedor interno PwC GenAI Shared Service.

    Llama a `POST {PWC_GENAI_BASE_URL}/chat/completions` con un payload
    Chat-Completions-like. El servicio no soporta necesariamente Structured
    Outputs nativo, por eso se le pide JSON puro (el JSON Schema del
    contrato va incluido en el user prompt, ver `app/prompts/lesson.py`) y
    se parsea manualmente `choices[0].message.content`.
    """

    name = "pwc"

    def __init__(self, settings: Settings) -> None:
        self._base_url = settings.pwc_genai_base_url.rstrip("/")
        self._model_name = settings.pwc_genai_model
        # Prioridad: PWC_GENAI_API_KEY, luego GEN_AI_API_KEY (fallback de
        # compatibilidad con entornos ya configurados así).
        self._api_key = settings.pwc_genai_api_key or settings.gen_ai_api_key

    def is_configured(self) -> bool:
        return bool(self._api_key)

    @property
    def model(self) -> str:
        return self._model_name

    def generate_structured(
        self, *, messages: list[dict[str, str]], response_model: type[ModelT]
    ) -> ModelT:
        if not self.is_configured():
            raise LLMConfigurationError(
                "Proveedor 'pwc': falta la credencial (PWC_GENAI_API_KEY o GEN_AI_API_KEY)."
            )
        if not self._model_name:
            raise LLMConfigurationError("Proveedor 'pwc': falta PWC_GENAI_MODEL.")

        url = f"{self._base_url}/chat/completions"
        payload = {"model": self._model_name, "messages": messages, "temperature": 0}
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

        try:
            response = httpx.post(
                url, json=payload, headers=headers, timeout=_PWC_REQUEST_TIMEOUT_SECONDS
            )
        except httpx.TimeoutException as exc:
            raise LLMUpstreamError(
                "Proveedor 'pwc': timeout esperando respuesta del servicio."
            ) from exc
        except httpx.ConnectError as exc:
            raise LLMUpstreamError(
                "Proveedor 'pwc': error de conexión con el servicio."
            ) from exc
        except httpx.HTTPError as exc:
            raise LLMUpstreamError(
                f"Proveedor 'pwc': error de red al llamar al servicio ({type(exc).__name__})."
            ) from exc

        if response.status_code in (401, 403):
            raise LLMAuthError(
                f"Proveedor 'pwc': credencial rechazada por el servicio (HTTP {response.status_code})."
            )
        if response.status_code >= 500:
            raise LLMUpstreamError(
                f"Proveedor 'pwc': error del servicio (HTTP {response.status_code})."
            )
        if response.status_code != 200:
            raise LLMResponseError(
                f"Proveedor 'pwc': respuesta HTTP no exitosa (HTTP {response.status_code})."
            )

        try:
            data = response.json()
        except ValueError as exc:
            raise LLMResponseError("Proveedor 'pwc': la respuesta no es JSON válido.") from exc

        if not isinstance(data, dict):
            raise LLMResponseError("Proveedor 'pwc': la respuesta no tiene la forma esperada.")

        choices = data.get("choices")
        if not choices or not isinstance(choices, list):
            raise LLMResponseError("Proveedor 'pwc': 'choices' vacío o ausente en la respuesta.")

        first_choice = choices[0]
        message = first_choice.get("message") if isinstance(first_choice, dict) else None
        content = message.get("content") if isinstance(message, dict) else None
        if not content or not isinstance(content, str):
            raise LLMResponseError("Proveedor 'pwc': 'message.content' ausente en la respuesta.")

        return parse_structured_json(content, response_model)


class OpenAIProvider(LLMProvider):
    """Proveedor OpenAI, usando una API key personal.

    Usa el SDK oficial de Python (`openai`) con
    `client.chat.completions.parse(response_format=<PydanticModel>)`
    (Structured Outputs) cuando el modelo configurado lo soporta. Se elige
    Chat Completions (en vez de, por ejemplo, la Responses API) para
    mantener una interfaz conceptualmente cercana a la de PwC GenAI Shared
    Service y evitar complejidad innecesaria. El resultado, de todas
    formas, vuelve a pasar por nuestra propia validación de grounding: no
    se confía únicamente en la validación del proveedor.
    """

    name = "openai"

    def __init__(self, settings: Settings) -> None:
        self._api_key = settings.openai_api_key
        self._model_name = settings.openai_model
        self._client = None
        if self._api_key:
            # Import diferido: evita que todo el módulo falle si el
            # paquete openai no estuviera instalado en algún entorno de
            # desarrollo mínimo, y evita costo de import cuando no se usa.
            from openai import OpenAI

            self._client = OpenAI(api_key=self._api_key)

    def is_configured(self) -> bool:
        return bool(self._api_key)

    @property
    def model(self) -> str:
        return self._model_name

    def generate_structured(
        self, *, messages: list[dict[str, str]], response_model: type[ModelT]
    ) -> ModelT:
        if not self.is_configured() or self._client is None:
            raise LLMConfigurationError("Proveedor 'openai': falta OPENAI_API_KEY.")
        if not self._model_name:
            raise LLMConfigurationError("Proveedor 'openai': falta OPENAI_MODEL.")

        from openai import (
            APIConnectionError,
            APIStatusError,
            APITimeoutError,
            AuthenticationError,
            ContentFilterFinishReasonError,
            LengthFinishReasonError,
        )

        try:
            completion = self._client.chat.completions.parse(
                model=self._model_name,
                messages=messages,
                response_format=response_model,
                temperature=0,
                timeout=_OPENAI_REQUEST_TIMEOUT_SECONDS,
            )
        except AuthenticationError as exc:
            raise LLMAuthError("Proveedor 'openai': credencial rechazada (401).") from exc
        except APITimeoutError as exc:
            raise LLMUpstreamError("Proveedor 'openai': timeout esperando respuesta.") from exc
        except APIConnectionError as exc:
            raise LLMUpstreamError("Proveedor 'openai': error de conexión.") from exc
        except APIStatusError as exc:
            status = exc.status_code
            if status in (401, 403):
                raise LLMAuthError(
                    f"Proveedor 'openai': credencial rechazada (HTTP {status})."
                ) from exc
            if status >= 500:
                raise LLMUpstreamError(
                    f"Proveedor 'openai': error del proveedor (HTTP {status})."
                ) from exc
            raise LLMResponseError(
                f"Proveedor 'openai': respuesta HTTP no exitosa (HTTP {status})."
            ) from exc
        except LengthFinishReasonError as exc:
            # El modelo respondió (HTTP 200) pero se truncó antes de poder
            # completar el structured output — esto es una respuesta
            # inválida/incompleta, NUNCA un problema de red/proveedor.
            raise LLMResponseError(
                "Proveedor 'openai': la respuesta se truncó antes de completar el "
                "formato estructurado esperado (finish_reason=length)."
            ) from exc
        except ContentFilterFinishReasonError as exc:
            raise LLMResponseError(
                "Proveedor 'openai': la respuesta fue bloqueada por el filtro de "
                "contenido del proveedor antes de completar el formato esperado."
            ) from exc
        except LLMProviderError:
            raise
        except Exception as exc:
            # Fase 8 (v1.0.1), sección 6 — bug real corregido: cualquier
            # excepción no reconocida hasta acá ocurre DESPUÉS de que el
            # SDK ya recibió una respuesta HTTP y está parseando/validando
            # el structured output localmente (json inválido, schema
            # incompatible, etc.) — es un problema de CONTRATO/RESPUESTA,
            # nunca de red/proveedor. Antes se reclasificaba como
            # LLMUpstreamError acá, lo que producía logs y HTTP 502
            # engañosos para una respuesta que en realidad fue HTTP 200.
            # Los errores de red/timeout/conexión/5xx genuinos ya fueron
            # capturados explícitamente arriba por su tipo específico del
            # SDK, así que lo que llega acá nunca es upstream real.
            raise LLMResponseError(
                f"Proveedor 'openai': la respuesta no pudo procesarse como el "
                f"contrato esperado ({type(exc).__name__})."
            ) from exc

        choices = getattr(completion, "choices", None)
        if not choices:
            raise LLMResponseError("Proveedor 'openai': 'choices' vacío en la respuesta.")

        message = choices[0].message
        refusal = getattr(message, "refusal", None)
        if refusal:
            raise LLMResponseError(f"Proveedor 'openai': el modelo rechazó la solicitud ({refusal}).")

        parsed = getattr(message, "parsed", None)
        if parsed is None:
            raise LLMResponseError(
                "Proveedor 'openai': la respuesta no pudo interpretarse como el contrato esperado."
            )
        return parsed


_SUPPORTED_PROVIDERS = ("pwc", "openai")


def get_llm_provider(settings: Settings) -> LLMProvider:
    """Factory que selecciona el proveedor según LLM_PROVIDER.

    La selección de provider es SIEMPRE configuración del backend
    (variable de entorno); nunca se acepta un provider enviado desde un
    request HTTP. Cualquier valor de LLM_PROVIDER distinto de "pwc" u
    "openai" produce un error de configuración claro (nunca un fallback
    silencioso).
    """
    provider_id = (settings.llm_provider or "").strip().lower()
    if provider_id == "pwc":
        return PwCGenAIProvider(settings)
    if provider_id == "openai":
        return OpenAIProvider(settings)
    raise LLMConfigurationError(
        f"LLM_PROVIDER='{settings.llm_provider}' no es válido. "
        f"Valores soportados: {', '.join(_SUPPORTED_PROVIDERS)}."
    )
