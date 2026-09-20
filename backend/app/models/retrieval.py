"""Modelos del retrieval determinístico course-wide (v1.4.0, Bloque 1).

Estos modelos son INTERNOS: no hay ningún endpoint HTTP que los exponga
todavía, y `CourseEvidenceCandidate` nunca se envía al frontend ni al LLM
en este bloque. Existen para que `app/services/course_retrieval.py` tenga
un contrato tipado y para que el bloque siguiente (integración con el
Tutor) pueda consumirlos sin adivinar la forma de los datos.
"""
from __future__ import annotations

from pydantic import BaseModel, Field


class CourseEvidenceCandidate(BaseModel):
    """Un `SourceBlock` de un tópico del curso, con la metadata necesaria
    para ubicarlo (course/module/topic identity), citarlo (source_ref,
    heading_path) y rankearlo (score, matched_terms) -- sin decidir
    todavía si "el curso responde la pregunta" (eso es responsabilidad de
    un bloque futuro, nunca de este servicio).

    Identidad lógica (ver PARTE 5 del bloque): `source_ref` por sí solo
    NO es único a nivel de curso -- cada tópico reinicia su numeración
    SRC-001, SRC-002... (`canonical.py::parse_source_blocks`, `ref_index`
    arranca en 0 en cada llamada, una por tópico). La identidad real de
    un candidato es la tupla `(course_id, module_id, topic_id,
    source_ref)`, representada acá como campos separados en vez de un
    string compuesto nuevo -- no hace falta inventar un identificador
    "COURSE-SRC-XXX" para este bloque; el bloque de integración con el
    Tutor puede construirlo si realmente lo necesita.
    """

    course_id: str
    module_id: str
    module_title: str
    topic_id: str
    topic_title: str

    source_ref: str
    block_type: str
    heading_path: list[str] = Field(default_factory=list)
    start_line: int
    end_line: int

    # Contenido tal cual vive en el SourceBlock original -- nunca mutado,
    # nunca reformulado (misma garantía que `canonical.py`).
    markdown: str
    plain_text: str

    score: float
    matched_terms: list[str] = Field(default_factory=list)
