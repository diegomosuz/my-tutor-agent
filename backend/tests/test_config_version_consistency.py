"""Regresión permanente (v1.3.0, Bloque 4, PARTE 28; extendida en v1.6.1
a `CERTIFICATION_PROMPT_VERSION`, y en v1.8.0 RC a `APP_VERSION`): confirma
que un valor de configuración no diverge silenciosamente entre el default
real de Python (la fuente de verdad) y los dos archivos de configuración
que lo reenvían como variable de entorno (`.env.example` y el fallback de
`docker-compose.yml`).

Este es un bug REAL que ya ocurrió en este proyecto: v1.1.0
(`CERTIFICATION_MAX_CONCURRENCY`/`LESSON_PROMPT_VERSION` nunca llegaban al
container porque `docker-compose.yml` no los reenviaba), otra vez durante
el Bloque 3 de v1.3.0 (`lesson-v3.3`), y una tercera vez en v1.6.1
(`CERTIFICATION_PROMPT_VERSION` avanzó a `certification-v2` en el código
pero `docker-compose.yml`/`.env.example`/`.env` seguían con
`certification-v1` hardcoded -- encontrado y corregido en la misma sesión
que agregó este test, antes de que llegara a un release). `APP_VERSION`
se agrega a esta misma regresión en la preparación del RC de v1.8.0 (PASO
5 del runbook: bump manual en tres archivos distintos es exactamente el
patrón que ya causó este bug tres veces). Nunca se testea `.env` (archivo
personal, gitignored, puede contener credenciales) — solo `.env.example`
(plantilla versionada) y `docker-compose.yml` (fallback versionado),
ambos montados de solo lectura en el container (ver docker-compose.yml,
PARTE 28).
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.prompts.certification import CERTIFICATION_PROMPT_VERSION
from app.prompts.lesson import LESSON_PROMPT_VERSION

_ENV_EXAMPLE_PATH = Path("/app/.env.example")
_DOCKER_COMPOSE_PATH = Path("/app/docker-compose.yml")
_CONFIG_PY_PATH = Path("/app/app/config.py")


def _extract_app_version_from_config_py() -> str | None:
    """`APP_VERSION` no tiene un módulo constante dedicado como
    `LESSON_PROMPT_VERSION`/`CERTIFICATION_PROMPT_VERSION` (es un literal
    inline en `Settings.app_version`) -- se parsea el SOURCE de
    `config.py` directamente, nunca se instancia `Settings()`, para que
    este test nunca dependa de qué `APP_VERSION` tenga configurado el
    entorno real donde corre (evita el mismo tipo de contaminación de
    hermeticidad que `.env` ya causó en otros tests, ver v1.0.1 en
    CLAUDE.md)."""
    text = _CONFIG_PY_PATH.read_text(encoding="utf-8")
    match = re.search(r'app_version:\s*str\s*=\s*"([^"]+)"', text)
    return match.group(1) if match else None


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


@pytest.mark.skipif(
    not _ENV_EXAMPLE_PATH.exists() or not _DOCKER_COMPOSE_PATH.exists() or not _CONFIG_PY_PATH.exists(),
    reason="Requiere los mounts de solo lectura de .env.example/docker-compose.yml/config.py "
    "(ver docker-compose.yml) -- no disponibles fuera de 'docker compose run backend pytest'.",
)
def test_app_version_matches_env_example():
    code_value = _extract_app_version_from_config_py()
    assert code_value is not None, "config.py no declara Settings.app_version"
    text = _ENV_EXAMPLE_PATH.read_text(encoding="utf-8")
    value = _extract_env_example_value(text, "APP_VERSION")
    assert value is not None, ".env.example no declara APP_VERSION"
    assert value == code_value, (
        f".env.example tiene APP_VERSION={value!r} pero el código real "
        f"(Settings.app_version en config.py) es {code_value!r} -- actualizar "
        ".env.example (y .env local, gitignored, no verificado acá) para que coincidan."
    )


@pytest.mark.skipif(
    not _ENV_EXAMPLE_PATH.exists() or not _DOCKER_COMPOSE_PATH.exists() or not _CONFIG_PY_PATH.exists(),
    reason="Requiere los mounts de solo lectura de .env.example/docker-compose.yml/config.py "
    "(ver docker-compose.yml) -- no disponibles fuera de 'docker compose run backend pytest'.",
)
def test_app_version_matches_docker_compose_fallback():
    code_value = _extract_app_version_from_config_py()
    assert code_value is not None, "config.py no declara Settings.app_version"
    text = _DOCKER_COMPOSE_PATH.read_text(encoding="utf-8")
    value = _extract_docker_compose_fallback(text, "APP_VERSION")
    assert value is not None, "docker-compose.yml no declara el fallback de APP_VERSION"
    assert value == code_value, (
        f"docker-compose.yml tiene el fallback APP_VERSION={value!r} pero el "
        f"código real (Settings.app_version en config.py) es {code_value!r} -- "
        "mismo bug que ya ocurrió varias veces (v1.1.0, Bloque 3 de v1.3.0, v1.6.1, "
        "y ahora auditado explícitamente para APP_VERSION en la preparación del "
        "RC de v1.8.0): la variable de entorno pisa el default de Python y el "
        "runtime sirve una versión distinta de la que dice el código."
    )
