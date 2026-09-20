def test_list_courses(client):
    response = client.get("/api/courses")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["id"] == "curso-de-prueba"
    assert body[0]["title"] == "Curso De Prueba"
    assert body[0]["module_count"] == 2
    assert body[0]["topic_count"] == 3


def test_get_course_detail(client):
    response = client.get("/api/courses/curso-de-prueba")
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == "curso-de-prueba"
    assert len(body["modules"]) == 2
    module1 = body["modules"][0]
    assert module1["id"] == "fundamentos"
    assert module1["title"] == "Fundamentos"
    assert len(module1["topics"]) == 2


def test_get_course_detail_not_found(client):
    response = client.get("/api/courses/curso-inexistente")
    assert response.status_code == 404


def test_get_topic(client):
    response = client.get(
        "/api/courses/curso-de-prueba/modules/fundamentos/topics/introduccion"
    )
    assert response.status_code == 200
    body = response.json()
    assert body["course"]["id"] == "curso-de-prueba"
    assert body["module"]["id"] == "fundamentos"
    assert body["topic"]["id"] == "introduccion"
    assert body["metadata"]["title"] == "Introducción"
    assert body["metadata"]["description"] == "Un tema de prueba"
    assert "Contenido de prueba" in body["content_markdown"]
    # El markdown original no debe incluir el bloque de frontmatter
    assert "title: Introducción" not in body["content_markdown"]


def test_get_topic_without_frontmatter_infers_metadata(client):
    response = client.get(
        "/api/courses/curso-de-prueba/modules/fundamentos/topics/componentes"
    )
    assert response.status_code == 200
    body = response.json()
    assert body["metadata"]["title"] == "Componentes"
    assert body["topic"]["order"] == 2


def test_get_topic_not_found(client):
    response = client.get(
        "/api/courses/curso-de-prueba/modules/fundamentos/topics/no-existe"
    )
    assert response.status_code == 404


def test_iter_all_canonical_topics_returns_every_topic_in_stable_order(content_dir):
    """v1.4.0 (Bloque 1): `iter_all_canonical_topics` debe devolver TODOS
    los tópicos del curso (cruzando módulos), en el mismo orden estable
    que `get_course_detail`, cada uno con su `CanonicalTopicContent` real
    -- introducida para `course_retrieval.py`, ver su docstring para la
    medición de performance que la motivó."""
    from app.config import Settings
    from app.services import courses as course_service

    settings = Settings(content_dir=str(content_dir))
    results = course_service.iter_all_canonical_topics(settings.content_path, "curso-de-prueba")

    assert [(m.id, t.id) for m, t, _c in results] == [
        ("fundamentos", "introduccion"),
        ("fundamentos", "componentes"),
        ("arquitecturas", "arquitectura-empresarial"),
    ]
    module_intro, topic_intro, canonical_intro = results[0]
    assert module_intro.title == "Fundamentos"
    assert topic_intro.title == "Introducción"
    assert canonical_intro.course_id == "curso-de-prueba"
    assert canonical_intro.module_id == "fundamentos"
    assert canonical_intro.topic_id == "introduccion"
    assert canonical_intro.source_block_count == len(canonical_intro.source_blocks)
    assert any("Contenido de prueba" in b.markdown for b in canonical_intro.source_blocks)


def test_iter_all_canonical_topics_matches_get_canonical_topic_per_topic(content_dir):
    """Mismo resultado que llamar `get_canonical_topic` una vez por
    tópico -- el helper bulk es una optimización de performance, nunca un
    camino de datos distinto."""
    from app.config import Settings
    from app.services import courses as course_service

    settings = Settings(content_dir=str(content_dir))
    bulk_results = course_service.iter_all_canonical_topics(
        settings.content_path, "curso-de-prueba"
    )
    for module_summary, topic_summary, canonical_bulk in bulk_results:
        canonical_individual = course_service.get_canonical_topic(
            settings.content_path, "curso-de-prueba", module_summary.id, topic_summary.id
        )
        assert canonical_bulk == canonical_individual
