"""Tests de seguridad: el API nunca debe permitir escapar del directorio
de contenido (path traversal), sin importar qué id se solicite.
"""
import urllib.parse


def test_path_traversal_in_course_id_rejected(client):
    traversal = urllib.parse.quote("../../../../etc/passwd", safe="")
    response = client.get(f"/api/courses/{traversal}")
    assert response.status_code == 404


def test_path_traversal_in_topic_path_rejected(client):
    traversal = urllib.parse.quote("../../../etc/passwd", safe="")
    response = client.get(
        f"/api/courses/curso-de-prueba/modules/fundamentos/topics/{traversal}"
    )
    assert response.status_code == 404


def test_path_traversal_cannot_read_outside_content(client, content_dir):
    # Crea un archivo secreto FUERA del content_dir para confirmar que
    # ninguna combinación de ids permite alcanzarlo.
    secret = content_dir.parent / "secret.md"
    secret.write_text("informacion secreta", encoding="utf-8")
    try:
        traversal = urllib.parse.quote("../secret", safe="")
        response = client.get(
            f"/api/courses/curso-de-prueba/modules/fundamentos/topics/{traversal}"
        )
        assert response.status_code == 404
    finally:
        secret.unlink(missing_ok=True)


def test_dotdot_course_id_not_found(client):
    response = client.get("/api/courses/..")
    assert response.status_code == 404
