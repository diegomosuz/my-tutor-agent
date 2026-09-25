"""Tests HTTP de /api/progress (v1.7.0, Bloque 2): GET/PUT/POST/DELETE,
aislamiento multiusuario (nunca acepta user_id del cliente -- siempre
`get_current_app_user`), validación de curso/módulo/tópico real, y
seguridad cross-user. Usa el fixture `client` (Postgres real, ver
tests/conftest.py) sobre la estructura de curso ya creada por
`content_dir` (curso-de-prueba/fundamentos/{introduccion,componentes},
arquitecturas/arquitectura-empresarial)."""
from __future__ import annotations

COURSE = "curso-de-prueba"
MODULE = "fundamentos"
TOPIC = "introduccion"


def test_get_progress_empty_for_never_touched_course(client):
    response = client.get(f"/api/progress/{COURSE}")
    assert response.status_code == 200
    assert response.json() == {"course_id": COURSE, "topics": []}


def test_get_progress_404_for_nonexistent_course(client):
    response = client.get("/api/progress/curso-que-no-existe")
    assert response.status_code == 404


def test_mark_started_then_get_reflects_it(client):
    put_resp = client.put(f"/api/progress/{COURSE}/{MODULE}/{TOPIC}", json={"action": "start"})
    assert put_resp.status_code == 200
    body = put_resp.json()
    assert body["status"] == "in_progress"
    assert body["started_at"] is not None
    assert body["completed_at"] is None

    get_resp = client.get(f"/api/progress/{COURSE}")
    assert get_resp.json()["topics"] == [
        {
            "module_id": MODULE,
            "topic_id": TOPIC,
            "status": "in_progress",
            "started_at": body["started_at"],
            "completed_at": None,
        }
    ]


def test_mark_completed(client):
    resp = client.put(f"/api/progress/{COURSE}/{MODULE}/{TOPIC}", json={"action": "complete"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "completed"
    assert resp.json()["completed_at"] is not None


def test_completed_never_downgrades_to_in_progress(client):
    client.put(f"/api/progress/{COURSE}/{MODULE}/{TOPIC}", json={"action": "complete"})
    resp = client.put(f"/api/progress/{COURSE}/{MODULE}/{TOPIC}", json={"action": "start"})
    assert resp.json()["status"] == "completed"


def test_mark_progress_404_invalid_module(client):
    resp = client.put(f"/api/progress/{COURSE}/modulo-inexistente/{TOPIC}", json={"action": "start"})
    assert resp.status_code == 404


def test_mark_progress_404_invalid_topic(client):
    resp = client.put(f"/api/progress/{COURSE}/{MODULE}/topico-inexistente", json={"action": "start"})
    assert resp.status_code == 404


def test_mark_progress_404_invalid_course(client):
    resp = client.put(
        f"/api/progress/curso-que-no-existe/{MODULE}/{TOPIC}", json={"action": "start"}
    )
    assert resp.status_code == 404


def test_mark_progress_rejects_invalid_action(client):
    resp = client.put(f"/api/progress/{COURSE}/{MODULE}/{TOPIC}", json={"action": "bogus"})
    assert resp.status_code == 422


def test_delete_course_progress(client):
    client.put(f"/api/progress/{COURSE}/{MODULE}/{TOPIC}", json={"action": "complete"})
    resp = client.delete(f"/api/progress/{COURSE}")
    assert resp.status_code == 204
    assert client.get(f"/api/progress/{COURSE}").json()["topics"] == []


def test_delete_progress_404_invalid_course(client):
    resp = client.delete("/api/progress/curso-que-no-existe")
    assert resp.status_code == 404


def test_legacy_import_merges_and_returns_current_state(client):
    client.put(f"/api/progress/{COURSE}/{MODULE}/{TOPIC}", json={"action": "complete"})
    resp = client.post(
        f"/api/progress/{COURSE}/legacy-import",
        json={
            "topics": [
                {"module_id": MODULE, "topic_id": TOPIC, "status": "in_progress"},
                {"module_id": MODULE, "topic_id": "componentes", "status": "in_progress"},
            ]
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    statuses = {t["topic_id"]: t["status"] for t in body["topics"]}
    assert statuses[TOPIC] == "completed"  # nunca degradado
    assert statuses["componentes"] == "in_progress"  # nuevo, creado por el import


def test_legacy_import_skips_entries_referencing_nonexistent_topics(client):
    resp = client.post(
        f"/api/progress/{COURSE}/legacy-import",
        json={"topics": [{"module_id": "modulo-fantasma", "topic_id": "topico-fantasma", "status": "completed"}]},
    )
    assert resp.status_code == 200
    assert resp.json()["topics"] == []


def test_legacy_import_404_invalid_course(client):
    resp = client.post("/api/progress/curso-que-no-existe/legacy-import", json={"topics": []})
    assert resp.status_code == 404


def test_legacy_import_empty_list_is_a_safe_noop(client):
    resp = client.post(f"/api/progress/{COURSE}/legacy-import", json={"topics": []})
    assert resp.status_code == 200
    assert resp.json()["topics"] == []


def test_legacy_import_completed_only_entry(client):
    resp = client.post(
        f"/api/progress/{COURSE}/legacy-import",
        json={"topics": [{"module_id": MODULE, "topic_id": TOPIC, "status": "completed"}]},
    )
    assert resp.status_code == 200
    assert resp.json()["topics"][0]["status"] == "completed"


def test_legacy_import_duplicate_entries_in_same_request_never_duplicate_rows(client):
    resp = client.post(
        f"/api/progress/{COURSE}/legacy-import",
        json={
            "topics": [
                {"module_id": MODULE, "topic_id": TOPIC, "status": "in_progress"},
                {"module_id": MODULE, "topic_id": TOPIC, "status": "completed"},
            ]
        },
    )
    assert resp.status_code == 200
    topics = resp.json()["topics"]
    assert len(topics) == 1
    assert topics[0]["status"] == "completed"


def test_legacy_import_malformed_entry_rejects_whole_request_422(client):
    """Un shape inválido (nunca enviado por un frontend bien comportado,
    que ya filtra localStorage corrupto ANTES de armar este request -- ver
    `learningProgressStore.ts::sanitizeDocument`) es responsabilidad de
    Pydantic, no de un skip parcial: distinto del caso "tópico ya no existe
    en el curriculum" (PASO 41), que sí se filtra en silencio."""
    resp = client.post(
        f"/api/progress/{COURSE}/legacy-import",
        json={"topics": [{"module_id": MODULE, "topic_id": TOPIC, "status": "not_a_real_status"}]},
    )
    assert resp.status_code == 422


def test_legacy_import_caps_entry_count(client):
    too_many = [{"module_id": MODULE, "topic_id": TOPIC, "status": "completed"} for _ in range(501)]
    resp = client.post(f"/api/progress/{COURSE}/legacy-import", json={"topics": too_many})
    assert resp.status_code == 422


# --- Aislamiento multiusuario / seguridad cross-user -----------------------


def test_two_dev_users_have_isolated_progress(client):
    client.put(
        f"/api/progress/{COURSE}/{MODULE}/{TOPIC}",
        json={"action": "complete"},
        headers={"X-Dev-User": "student-a"},
    )
    a_view = client.get(f"/api/progress/{COURSE}", headers={"X-Dev-User": "student-a"}).json()
    b_view = client.get(f"/api/progress/{COURSE}", headers={"X-Dev-User": "student-b"}).json()
    assert a_view["topics"][0]["status"] == "completed"
    assert b_view["topics"] == []


def test_endpoints_never_accept_user_id_field(client):
    """PASO 13/49: el body nunca es una vía para suplantar a otro usuario
    -- un campo `user_id` inventado en el request se ignora por completo
    (Pydantic descarta campos no declarados en el schema)."""
    resp = client.put(
        f"/api/progress/{COURSE}/{MODULE}/{TOPIC}",
        json={"action": "start", "user_id": "11111111-1111-1111-1111-111111111111"},
        headers={"X-Dev-User": "student-a"},
    )
    assert resp.status_code == 200
    # Confirma que quedó atado a student-a (resuelto por identidad), no al
    # user_id fantasma del body.
    a_view = client.get(f"/api/progress/{COURSE}", headers={"X-Dev-User": "student-a"}).json()
    assert len(a_view["topics"]) == 1


def test_reset_isolated_per_user(client):
    client.put(
        f"/api/progress/{COURSE}/{MODULE}/{TOPIC}",
        json={"action": "complete"},
        headers={"X-Dev-User": "student-a"},
    )
    client.put(
        f"/api/progress/{COURSE}/{MODULE}/{TOPIC}",
        json={"action": "complete"},
        headers={"X-Dev-User": "student-b"},
    )
    client.delete(f"/api/progress/{COURSE}", headers={"X-Dev-User": "student-a"})
    a_view = client.get(f"/api/progress/{COURSE}", headers={"X-Dev-User": "student-a"}).json()
    b_view = client.get(f"/api/progress/{COURSE}", headers={"X-Dev-User": "student-b"}).json()
    assert a_view["topics"] == []
    assert len(b_view["topics"]) == 1
