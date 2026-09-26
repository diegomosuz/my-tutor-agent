"""Paridad exacta backend/frontend (v1.7.0, Bloque 4, PARTE D de la
especificación). Consume el fixture COMPARTIDO
`fixtures/learning_state_parity.json` (mismo archivo que
`frontend/src/learning/__tests__/learningStateParity.test.ts`, montado
read-only en ambos containers -- ver docker-compose.yml) para probar que
el core pedagógico puro en Python produce EXACTAMENTE el mismo resultado
que `topicLearningSignal.ts`/`learningState.ts` para cada caso.

Cubre únicamente la derivación pura por-tópico (casos 1-13 del fixture) --
los casos de curriculum/curso completo (top-50, duplicate slugs, stale
evidence) tienen tests de integración dedicados en
`test_learning_profile_service.py` (decisión documentada en
docs/SERVER_SIDE_PROFILE_V1_7.md sección Bloque 4)."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.models.certification import CertificationAttemptEntry, TopicBreakdown
from app.services.learning_state import derive_topic_learning_signal, derive_topic_learning_state

_FIXTURE_PATH = Path("/app/fixtures/learning_state_parity.json")


def _load_cases() -> list[dict]:
    if not _FIXTURE_PATH.exists():
        return []
    data = json.loads(_FIXTURE_PATH.read_text(encoding="utf-8"))
    return data["cases"]


def _attempt_from_fixture(entry: dict) -> CertificationAttemptEntry:
    breakdowns = [TopicBreakdown(**b) for b in entry["performance_by_topic"]]
    module_ids = sorted({b.module_id for b in breakdowns})
    topic_ids = sorted({b.topic_id for b in breakdowns})
    return CertificationAttemptEntry(
        attempt_id=f"fixture-{entry['completed_at']}",
        course_id="curso-demo",
        mode="practice",
        module_ids=module_ids,
        topic_ids=topic_ids,
        question_count=sum(b.attempted for b in breakdowns),
        answered_count=sum(b.attempted for b in breakdowns),
        correct_count=sum(b.correct for b in breakdowns),
        partial_count=sum(b.partially_correct for b in breakdowns),
        incorrect_count=sum(b.incorrect for b in breakdowns),
        unanswered_count=sum(b.unanswered for b in breakdowns),
        score_percentage=breakdowns[0].practice_score_percent,
        completed_at=entry["completed_at"],
        performance_by_topic=breakdowns,
        competencies_to_reinforce=[],
        topics_to_reinforce=[],
        origin="server_evaluated",
    )


_CASES = _load_cases()

pytestmark = pytest.mark.skipif(
    not _CASES,
    reason="Requiere el fixture compartido montado en /app/fixtures (ver docker-compose.yml) -- "
    "no disponible fuera de 'docker compose run backend pytest'.",
)


@pytest.mark.parametrize("case", _CASES, ids=[c["name"] for c in _CASES] if _CASES else [])
def test_parity_case(case: dict):
    attempts = [_attempt_from_fixture(a) for a in case["attempts"]]
    signal = derive_topic_learning_signal(
        case["module_id"], case["topic_id"], case["curricular_status"], attempts
    )
    status, reason_code = derive_topic_learning_state(signal)
    expected = case["expected"]

    assert status == expected["status"], f"{case['name']}: status"
    assert reason_code == expected["reason_code"], f"{case['name']}: reason_code"
    assert signal.observations == expected["observations"], f"{case['name']}: observations"
    assert signal.latest_score == expected["latest_score"], f"{case['name']}: latest_score"
    assert signal.recent_average == expected["recent_average"], f"{case['name']}: recent_average"


def test_fixture_has_expected_case_count():
    assert len(_CASES) == 13
