"""Tests de seguridad del endpoint de assets de curso (Fase 7, secciones
13/54): traversal imposible, allow-list de extensiones, MIME correcto."""
from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import app
from app.services import courses as course_service

_PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16
_JPG_BYTES = b"\xff\xd8\xff\xe0" + b"\x00" * 16


def _make_content_dir(tmp_path: Path) -> Path:
    content_dir = tmp_path / "content"
    module_dir = content_dir / "curso-demo" / "01-modulo"
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
    # Un archivo real FUERA del module_dir, para probar traversal.
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
