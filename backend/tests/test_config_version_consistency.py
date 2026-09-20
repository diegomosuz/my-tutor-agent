"""Regresión permanente (v1.3.0, Bloque 4, PARTE 28): confirma que
`LESSON_PROMPT_VERSION` no diverge silenciosamente entre el default real
de Python (`app.prompts.lesson.LESSON_PROMPT_VERSION`, la fuente de
verdad) y los dos archivos de configuración que la reenvían como variable
de entorno (`.env.example` y el fallback de `docker-compose.yml`).

Este es un bug REAL que ya ocurrió dos veces en este proyecto: v1.1.0
(`CERTIFICATION_MAX_CONCURRENCY`/`LESSON_PROMPT_VERSION` nunca llegaban al
container porque `docker-compose.yml` no los reenviaba) y otra vez durante
el Bloque 3 de v1.3.0 (esta sesión: el código avanzó a `lesson-v3.3` pero
`.env`/`.env.example`/`docker-compose.yml` seguían con el valor viejo
hardcodeado, y la app servía silenciosamente el prompt anterior pese al
cambio de código). Nunca se testea `.env` (archivo personal, gitignored,
puede contener credenciales) — solo `.env.example` (plantilla versionada)
y `docker-compose.yml` (fallback versionado), ambos montados de solo
lectura en el container (ver docker-compose.yml, PARTE 28).
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.prompts.lesson import LESSON_PROMPT_VERSION

_ENV_EXAMPLE_PATH = Path("/app/.env.example")
_DOCKER_COMPOSE_PATH = Path("/app/docker-compose.yml")


def _extract_env_example_value(text: str) -> str | None:
    match = re.search(r"^LESSON_PROMPT_VERSION=(\S+)\s*$", text, re.MULTILINE)
    return match.group(1) if match else None


def _extract_docker_compose_fallback(text: str) -> str | None:
    match = re.search(r"LESSON_PROMPT_VERSION:\s*\$\{LESSON_PROMPT_VERSION:-(\S+?)\}", text)
    return match.group(1) if match else None


@pytest.mark.skipif(
    not _ENV_EXAMPLE_PATH.exists() or not _DOCKER_COMPOSE_PATH.exists(),
    reason="Requiere los mounts de solo lectura de .env.example/docker-compose.yml "
    "(ver docker-compose.yml) -- no disponibles fuera de 'docker compose run backend pytest'.",
)
def test_lesson_prompt_version_matches_env_example():
    text = _ENV_EXAMPLE_PATH.read_text(encoding="utf-8")
    value = _extract_env_example_value(text)
    assert value is not None, ".env.example no declara LESSON_PROMPT_VERSION"
    assert value == LESSON_PROMPT_VERSION, (
        f".env.example tiene LESSON_PROMPT_VERSION={value!r} pero el código real es "
        f"{LESSON_PROMPT_VERSION!r} -- actualizar .env.example (y .env local, gitignored, "
        "no verificado acá) para que coincidan."
    )


@pytest.mark.skipif(
    not _ENV_EXAMPLE_PATH.exists() or not _DOCKER_COMPOSE_PATH.exists(),
    reason="Requiere los mounts de solo lectura de .env.example/docker-compose.yml "
    "(ver docker-compose.yml) -- no disponibles fuera de 'docker compose run backend pytest'.",
)
def test_lesson_prompt_version_matches_docker_compose_fallback():
    text = _DOCKER_COMPOSE_PATH.read_text(encoding="utf-8")
    value = _extract_docker_compose_fallback(text)
    assert value is not None, "docker-compose.yml no declara el fallback de LESSON_PROMPT_VERSION"
    assert value == LESSON_PROMPT_VERSION, (
        f"docker-compose.yml tiene el fallback LESSON_PROMPT_VERSION={value!r} pero el "
        f"código real es {LESSON_PROMPT_VERSION!r} -- este es exactamente el bug que ya "
        "ocurrió dos veces (v1.1.0, Bloque 3 de v1.3.0): la variable de entorno pisa el "
        "default de Python y el runtime sirve un prompt distinto del que dice el código."
    )
