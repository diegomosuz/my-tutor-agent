"""Tests de seguridad del endpoint de assets de curso (Fase 7, secciones
13/54): traversal imposible, allow-list de extensiones, MIME correcto."""
from __future__ import annotations

from pathlib import Path
from urllib.parse import quote

import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import app
from app.services import courses as course_service

_PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16
_JPG_BYTES = b"\xff\xd8\xff\xe0" + b"\x00" * 16


def _make_content_dir(tmp_path: Path) -> Path:
    content_dir = tmp_path / "content"
    course_dir = content_dir / "curso-demo"
    module_dir = course_dir / "01-modulo"
    images_dir = module_dir / "images"
    images_dir.mkdir(parents=True)
    (module_dir / "01-topico.md").write_text(
        "# Tema\n\n![Arquitectura](images/architecture.png)\n", encoding="utf-8"
    )
    (images_dir / "architecture.png").write_bytes(_PNG_BYTES)
    (images_dir / "photo.jpg").write_bytes(_JPG_BYTES)
    (images_dir / "vector.svg").write_text("<svg><script>alert(1)</script></svg>", encoding="utf-8")
    (images_dir / "page.html").write_text("<html></html>", encoding="utf-8")
    (images_dir / "script.js").write_text("alert(1)", encoding="utf-8")
    # v1.6.1: asset compartido a NIVEL DE CURSO (sibling de los módulos,
    # mismo patrón real encontrado en un curso real -- `_recursos/`),
    # referenciado desde un tópico con una ruta que sube un nivel. Debe
    # poder servirse porque sigue dentro del curso (aunque salga del
    # módulo), a diferencia de antes de v1.6.1.
    shared_dir = course_dir / "_recursos"
    shared_dir.mkdir(parents=True)
    (shared_dir / "diagrama-compartido.png").write_bytes(_PNG_BYTES)
    # Un segundo módulo real, para probar acceso cruzado módulo->módulo
    # dentro del MISMO curso (debe seguir bloqueado: un asset nunca se
    # resuelve relativo a otro módulo, solo relativo al propio módulo o
    # a un directorio de nivel de curso).
    other_module_images = course_dir / "02-otro-modulo" / "images"
    other_module_images.mkdir(parents=True)
    (course_dir / "02-otro-modulo" / "02-topico.md").write_text("# Otro tema\n", encoding="utf-8")
    (other_module_images / "solo-del-otro-modulo.png").write_bytes(_PNG_BYTES)
    # Un curso HERMANO real (para probar que un asset nunca cruza de un
    # curso a otro, incluso si el archivo existe de verdad).
    sibling_course_dir = content_dir / "otro-curso"
    sibling_course_dir.mkdir(parents=True)
    (sibling_course_dir / "secreto-de-otro-curso.png").write_bytes(_PNG_BYTES)
    # Un archivo real FUERA de cualquier curso (arriba del content root),
    # para probar traversal que escapa por completo del filesystem de
    # cursos.
    (content_dir / "secret.png").write_bytes(_PNG_BYTES)
    return content_dir


@pytest.fixture
def client(tmp_path):
    content_dir = _make_content_dir(tmp_path)

    def _override_settings() -> Settings:
        return Settings(content_dir=str(content_dir))

    app.dependency_overrides[get_settings] = _override_settings
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


_ASSET_URL = "/api/courses/curso-demo/modules/modulo/topics/topico/assets/{}"


def test_valid_png_served_with_correct_mime(client):
    response = client.get(_ASSET_URL.format("images/architecture.png"))
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.content == _PNG_BYTES


def test_valid_jpg_served_with_correct_mime(client):
    response = client.get(_ASSET_URL.format("images/photo.jpg"))
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/jpeg"


def test_missing_asset_returns_404(client):
    response = client.get(_ASSET_URL.format("images/does-not-exist.png"))
    assert response.status_code == 404


def test_relative_traversal_returns_404(client):
    response = client.get(_ASSET_URL.format("../../../secret.png"))
    assert response.status_code == 404


def test_traversal_out_of_module_returns_404(client):
    response = client.get(_ASSET_URL.format("../../secret.png"))
    assert response.status_code == 404


def test_absolute_path_returns_404(client):
    response = client.get(_ASSET_URL.format("%2Fetc%2Fpasswd"))
    assert response.status_code == 404


def test_encoded_traversal_returns_404(client):
    response = client.get(_ASSET_URL.format("images%2F..%2F..%2Fsecret.png"))
    assert response.status_code == 404


def test_svg_not_served(client):
    response = client.get(_ASSET_URL.format("images/vector.svg"))
    assert response.status_code == 404


def test_html_not_served(client):
    response = client.get(_ASSET_URL.format("images/page.html"))
    assert response.status_code == 404


def test_js_not_served(client):
    response = client.get(_ASSET_URL.format("images/script.js"))
    assert response.status_code == 404


def test_case_insensitive_dangerous_extension_still_blocked(client, tmp_path):
    # .HTML en mayúsculas: la comparación de extensión debe ser
    # case-insensitive y seguir bloqueando.
    response = client.get(_ASSET_URL.format("images/page.HTML"))
    assert response.status_code == 404


def test_resolve_topic_asset_raises_for_nonexistent_topic(tmp_path):
    content_dir = _make_content_dir(tmp_path)
    with pytest.raises(course_service.TopicNotFoundError):
        course_service.resolve_topic_asset(
            content_dir, "curso-demo", "modulo", "no-existe", "images/architecture.png"
        )


# --- v1.6.1: asset compartido a nivel de curso (bug real corregido) ------


def _encode_asset_path(path: str) -> str:
    """Misma codificación que `getTopicAssetUrl` en el frontend (v1.6.1):
    TODO `path` (incluidos los "/" internos) como un único segmento
    percent-encoded. Un intento previo de codificar solo los puntos
    (`%2E`) NO alcanzaba: un browser real (WHATWG URL Standard) aplica
    remove_dot_segments sobre el PATH de la URL reconociendo un segmento
    "."/".." incluso con los puntos percent-encoded -- confirmado en
    runtime real con Chromium. Encodear el "/" también (`%2F`) evita que
    exista un segmento literal igual a "." o ".." en absoluto. El backend
    decodifica esto vía `unquote()` sobre el parámetro `{asset_path:path}`
    (mismo mecanismo que ya cubre `test_encoded_traversal_returns_404`);
    la seguridad real sigue dependiendo exclusivamente de
    `Path.resolve()` + `is_relative_to(...)` en `resolve_topic_asset`,
    nunca de qué caracteres tenga el string de la URL."""
    return quote(path, safe="")


def test_course_level_shared_asset_via_parent_relative_path_is_served(client):
    # Bug real encontrado en v1.6.1: antes, `../_recursos/foo.png` se
    # rechazaba (la contención era solo contra el directorio del MÓDULO).
    # Ahora debe servirse porque sigue dentro del CURSO.
    response = client.get(_ASSET_URL.format(_encode_asset_path("../_recursos/diagrama-compartido.png")))
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.content == _PNG_BYTES


def test_asset_from_another_module_of_the_same_course_is_allowed(client):
    # El límite de seguridad real es el CURSO (PARTE 37/67 de la
    # especificación de v1.6.1), no el módulo: un asset de OTRO módulo del
    # mismo curso debe poder resolverse igual, el mismo criterio que ya
    # usa el resto de la app para tratar "curso" como la unidad de
    # contención (grounding packets, course-wide retrieval del tutor,
    # etc. -- todos scoped por curso, nunca por módulo).
    response = client.get(
        _ASSET_URL.format(_encode_asset_path("../02-otro-modulo/images/solo-del-otro-modulo.png"))
    )
    assert response.status_code == 200
    assert response.content == _PNG_BYTES


def test_asset_never_crosses_into_another_course(client):
    # El archivo EXISTE de verdad (en otro curso real) -- debe seguir
    # bloqueado igual: la contención es por curso, nunca por content root
    # completo.
    response = client.get(_ASSET_URL.format(_encode_asset_path("../../otro-curso/secreto-de-otro-curso.png")))
    assert response.status_code == 404


def test_traversal_above_content_root_still_blocked_even_if_file_exists(client):
    # secret.png EXISTE de verdad, un nivel arriba del content root visto
    # desde el módulo -- confirma que el límite real es el curso, no solo
    # "el archivo existe en algún lado del disco".
    response = client.get(_ASSET_URL.format(_encode_asset_path("../../../secret.png")))
    assert response.status_code == 404


def test_embedded_null_byte_returns_safe_404_not_500(client):
    # Bug real encontrado en hardening (v1.6.1), misma familia que el
    # anterior: un byte nulo embebido en el path (técnica histórica de
    # truncar un path en implementaciones basadas en C) hace que
    # `.resolve()` lance `ValueError: embedded null byte` en Python --
    # sin capturarla, 500 sin control en vez del 404 uniforme.
    response = client.get(_ASSET_URL.format(_encode_asset_path("images/architecture.png\x00.svg")))
    assert response.status_code == 404
    assert response.json() == {"detail": "Asset no encontrado"}


def test_extremely_long_asset_path_returns_safe_404_not_500(client):
    # Bug real encontrado en hardening (v1.6.1): un nombre de archivo muy
    # largo hace que `.is_file()` toque el disco y el SO lance
    # `OSError` (ENAMETOOLONG, "File name too long" en Linux) -- sin
    # capturarla, esto producía un 500 sin control en vez del 404
    # uniforme que el resto de esta función ya garantiza para cualquier
    # otro path inválido. La respuesta nunca debe distinguir "nombre
    # demasiado largo" de "no existe" (mismo principio de "un único tipo
    # de error" que ya aplica a not-found/tipo-no-soportado/traversal).
    long_name = "a" * 3000 + ".png"
    response = client.get(_ASSET_URL.format(_encode_asset_path(long_name)))
    assert response.status_code == 404
    assert response.json() == {"detail": "Asset no encontrado"}


# --- v1.6.1: course discovery no confunde directorios "_prefijo" con módulos ---


def test_underscore_prefixed_directory_never_becomes_a_phantom_module(tmp_path):
    content_dir = _make_content_dir(tmp_path)
    course_detail = course_service.get_course_detail(content_dir, "curso-demo")
    module_ids = [m.id for m in course_detail.modules]
    assert "recursos" not in module_ids
    # Los 2 módulos reales (01-modulo, 02-otro-modulo) SÍ deben seguir apareciendo.
    assert len(module_ids) == 2
