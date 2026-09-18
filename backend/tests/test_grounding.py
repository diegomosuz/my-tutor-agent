"""Tests de integración HTTP para el modelo canónico expuesto en la API:
el campo `canonical` en el endpoint de tópico y el endpoint de inspección
`/grounding`.
"""
import re


def test_topic_response_includes_canonical_info(client):
    response = client.get(
        "/api/courses/curso-de-prueba/modules/fundamentos/topics/introduccion"
    )
    assert response.status_code == 200
    body = response.json()

    assert "canonical" in body
    canonical = body["canonical"]
    assert set(canonical.keys()) == {"content_sha256", "source_block_count", "source_blocks"}
    assert len(canonical["content_sha256"]) == 64  # hex sha256
    assert canonical["source_block_count"] == len(canonical["source_blocks"])
    assert canonical["source_block_count"] > 0

    first_block = canonical["source_blocks"][0]
    assert first_block["source_ref"] == "SRC-001"
    assert first_block["block_type"] == "heading"
    assert first_block["start_line"] <= first_block["end_line"]
    assert "heading_path" in first_block

    # El markdown original completo se sigue devolviendo sin cambios
    # (compatibilidad hacia atrás con el frontend de Fase 1).
    assert body["content_markdown"].startswith("# Introducción")


def test_topic_canonical_source_refs_are_sequential(client):
    response = client.get(
        "/api/courses/curso-de-prueba/modules/fundamentos/topics/introduccion"
    )
    blocks = response.json()["canonical"]["source_blocks"]
    refs = [b["source_ref"] for b in blocks]
    assert refs == [f"SRC-{i:03d}" for i in range(1, len(refs) + 1)]


def test_grounding_endpoint_returns_expected_shape(client):
    response = client.get(
        "/api/courses/curso-de-prueba/modules/fundamentos/topics/introduccion/grounding"
    )
    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == {"content_sha256", "source_block_count", "grounding_packet"}
    assert len(body["content_sha256"]) == 64

    packet = body["grounding_packet"]
    assert packet.startswith("=== AUTHORIZED SOURCE: TOPIC ===")
    assert "=== END AUTHORIZED SOURCE ===" in packet
    assert f"Content SHA256: {body['content_sha256']}" in packet

    refs_in_packet = set(re.findall(r"\[SRC-\d{3}\]", packet))
    assert len(refs_in_packet) == body["source_block_count"]


def test_grounding_endpoint_hash_matches_topic_endpoint(client):
    topic_resp = client.get(
        "/api/courses/curso-de-prueba/modules/fundamentos/topics/introduccion"
    )
    grounding_resp = client.get(
        "/api/courses/curso-de-prueba/modules/fundamentos/topics/introduccion/grounding"
    )
    assert (
        topic_resp.json()["canonical"]["content_sha256"]
        == grounding_resp.json()["content_sha256"]
    )


def test_grounding_endpoint_not_found_course(client):
    response = client.get(
        "/api/courses/curso-inexistente/modules/fundamentos/topics/introduccion/grounding"
    )
    assert response.status_code == 404


def test_grounding_endpoint_not_found_module(client):
    response = client.get(
        "/api/courses/curso-de-prueba/modules/modulo-inexistente/topics/introduccion/grounding"
    )
    assert response.status_code == 404


def test_grounding_endpoint_not_found_topic(client):
    response = client.get(
        "/api/courses/curso-de-prueba/modules/fundamentos/topics/no-existe/grounding"
    )
    assert response.status_code == 404


def test_grounding_endpoint_no_path_traversal(client):
    import urllib.parse

    traversal = urllib.parse.quote("../../../etc/passwd", safe="")
    response = client.get(
        f"/api/courses/curso-de-prueba/modules/fundamentos/topics/{traversal}/grounding"
    )
    assert response.status_code == 404


def test_grounding_packet_does_not_leak_secrets(client):
    response = client.get(
        "/api/courses/curso-de-prueba/modules/fundamentos/topics/introduccion/grounding"
    )
    packet = response.json()["grounding_packet"]
    lowered = packet.lower()
    for forbidden in ["api_key", "apikey", "secret", "token", "password"]:
        assert forbidden not in lowered
