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
