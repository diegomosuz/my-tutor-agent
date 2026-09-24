"""Regresión permanente (v1.3.0, Bloque 4, PARTE 28; extendida en v1.6.1
a `CERTIFICATION_PROMPT_VERSION`): confirma que un prompt version no
diverge silenciosamente entre el default real de Python (la fuente de
verdad) y los dos archivos de configuración que lo reenvían como
variable de entorno (`.env.example` y el fallback de `docker-compose.yml`).

Este es un bug REAL que ya ocurrió en este proyecto: v1.1.0
(`CERTIFICATION_MAX_CONCURRENCY`/`LESSON_PROMPT_VERSION` nunca llegaban al
container porque `docker-compose.yml` no los reenviaba), otra vez durante
el Bloque 3 de v1.3.0 (`lesson-v3.3`), y una tercera vez en v1.6.1
(`CERTIFICATION_PROMPT_VERSION` avanzó a `certification-v2` en el código
pero `docker-compose.yml`/`.env.example`/`.env` seguían con
`certification-v1` hardcoded -- encontrado y corregido en la misma sesión
que agregó este test, antes de que llegara a un release). Nunca se testea
`.env` (archivo personal, gitignored, puede contener credenciales) —
solo `.env.example` (plantilla versionada) y `docker-compose.yml`
(fallback versionado), ambos montados de solo lectura en el container
(ver docker-compose.yml, PARTE 28).
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.prompts.certification import CERTIFICATION_PROMPT_VERSION
from app.prompts.lesson import LESSON_PROMPT_VERSION

_ENV_EXAMPLE_PATH = Path("/app/.env.example")
_DOCKER_COMPOSE_PATH = Path("/app/docker-compose.yml")


def _extract_env_example_value(text: str, var_name: str) -> str | None:
    match = re.search(rf"^{re.escape(var_name)}=(\S+)\s*$", text, re.MULTILINE)
    return match.group(1) if match else None


def _extract_docker_compose_fallback(text: str, var_name: str) -> str | None:
    match = re.search(
        rf"{re.escape(var_name)}:\s*\$\{{{re.escape(var_name)}:-(\S+?)\}}", text
    )
    return match.group(1) if match else None


_PROMPT_VERSIONS = [
    ("LESSON_PROMPT_VERSION", LESSON_PROMPT_VERSION),
    ("CERTIFICATION_PROMPT_VERSION", CERTIFICATION_PROMPT_VERSION),
]


@pytest.mark.skipif(
    not _ENV_EXAMPLE_PATH.exists() or not _DOCKER_COMPOSE_PATH.exists(),
    reason="Requiere los mounts de solo lectura de .env.example/docker-compose.yml "
    "(ver docker-compose.yml) -- no disponibles fuera de 'docker compose run backend pytest'.",
)
@pytest.mark.parametrize("var_name,code_value", _PROMPT_VERSIONS)
def test_prompt_version_matches_env_example(var_name, code_value):
    text = _ENV_EXAMPLE_PATH.read_text(encoding="utf-8")
    value = _extract_env_example_value(text, var_name)
    assert value is not None, f".env.example no declara {var_name}"
    assert value == code_value, (
        f".env.example tiene {var_name}={value!r} pero el código real es "
        f"{code_value!r} -- actualizar .env.example (y .env local, gitignored, "
        "no verificado acá) para que coincidan."
    )


@pytest.mark.skipif(
    not _ENV_EXAMPLE_PATH.exists() or not _DOCKER_COMPOSE_PATH.exists(),
    reason="Requiere los mounts de solo lectura de .env.example/docker-compose.yml "
    "(ver docker-compose.yml) -- no disponibles fuera de 'docker compose run backend pytest'.",
)
@pytest.mark.parametrize("var_name,code_value", _PROMPT_VERSIONS)
def test_prompt_version_matches_docker_compose_fallback(var_name, code_value):
    text = _DOCKER_COMPOSE_PATH.read_text(encoding="utf-8")
    value = _extract_docker_compose_fallback(text, var_name)
    assert value is not None, f"docker-compose.yml no declara el fallback de {var_name}"
    assert value == code_value, (
        f"docker-compose.yml tiene el fallback {var_name}={value!r} pero el "
        f"código real es {code_value!r} -- este es exactamente el bug que ya "
        "ocurrió varias veces (v1.1.0, Bloque 3 de v1.3.0, v1.6.1): la variable de entorno "
        "pisa el default de Python y el runtime sirve un prompt distinto del que dice el código."
    )
