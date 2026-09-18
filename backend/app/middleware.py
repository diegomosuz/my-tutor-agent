"""Middleware simple de request ID y headers de seguridad (Fase 7, secciones
40/51). Deliberadamente sin un framework de tracing: un UUID por request es
suficiente para correlacionar logs durante debugging local.
"""
from __future__ import annotations

import re
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.services.service_logging import current_request_id

_REQUEST_ID_HEADER = "X-Request-ID"
_VALID_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{1,128}$")


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Si el cliente envía `X-Request-ID` con un formato razonable, se
    reutiliza (permite correlacionar con logs del lado del cliente); si no,
    o si el valor es inválido/demasiado largo, se genera un UUID nuevo.
    Siempre se devuelve en la respuesta. Se publica también en un
    ContextVar (`current_request_id`) para que `log_event` lo incluya
    automáticamente sin que cada servicio lo reciba como parámetro."""

    async def dispatch(self, request: Request, call_next):
        incoming = request.headers.get(_REQUEST_ID_HEADER)
        request_id = incoming if incoming and _VALID_REQUEST_ID.match(incoming) else str(uuid.uuid4())
        request.state.request_id = request_id
        token = current_request_id.set(request_id)
        try:
            response: Response = await call_next(request)
        finally:
            current_request_id.reset(token)
        response.headers[_REQUEST_ID_HEADER] = request_id
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Headers razonables que no rompen la app local (sección 51). CSP
    deliberadamente NO se agrega acá: el frontend corre con el dev server
    de Vite (HMR usa WebSockets/inline scripts) y una CSP mal calibrada
    rompería el entorno de desarrollo sin agregar protección real en un
    contexto 100% local — se documenta esta decisión explícitamente en
    lugar de agregar una CSP incorrecta solo para marcar un checklist."""

    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "same-origin"
        return response
