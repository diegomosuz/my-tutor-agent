"""Utilidades para interpretar nombres de archivos/directorios del filesystem
de cursos: prefijos numéricos, slugs de identificación y títulos legibles.
"""
from __future__ import annotations

import re

_LEADING_NUMBER = re.compile(r"^(\d+)[-_. ]*")
_NON_SLUG_CHARS = re.compile(r"[^a-z0-9-]")
_MULTI_DASH = re.compile(r"-+")
_MULTI_SPACE = re.compile(r"\s+")


def extract_order(raw_name: str) -> int:
    """Extrae el prefijo numérico de un nombre (ej: '01-intro' -> 1).

    Si no hay prefijo numérico, devuelve un valor alto para que ese
    elemento se ordene al final, después de los que sí lo tienen.
    """
    match = _LEADING_NUMBER.match(raw_name)
    if match:
        return int(match.group(1))
    return 10_000


def strip_prefix(raw_name: str) -> str:
    """Quita el prefijo numérico de un nombre."""
    return _LEADING_NUMBER.sub("", raw_name, count=1)


def slugify(raw_name: str) -> str:
    """Convierte un nombre de filesystem en un identificador estable para URLs.

    Quita el prefijo numérico, pasa a minúsculas y reemplaza espacios/
    guiones bajos por guiones.
    """
    stripped = strip_prefix(raw_name).strip().lower()
    stripped = stripped.replace("_", "-")
    stripped = _MULTI_SPACE.sub("-", stripped)
    stripped = _NON_SLUG_CHARS.sub("", stripped)
    stripped = _MULTI_DASH.sub("-", stripped).strip("-")
    return stripped or raw_name.lower()


def humanize(raw_name: str) -> str:
    """Convierte un nombre de filesystem en un título legible.

    Quita el prefijo numérico y convierte guiones/underscores en espacios.
    Preserva palabras que ya están completamente en mayúsculas (ej: 'IA').
    """
    stripped = strip_prefix(raw_name)
    stripped = stripped.replace("-", " ").replace("_", " ").strip()
    if not stripped:
        return raw_name

    words = []
    for word in stripped.split(" "):
        if not word:
            continue
        if word.isupper() and len(word) > 1:
            words.append(word)
        else:
            words.append(word[:1].upper() + word[1:])
    return " ".join(words) if words else raw_name
