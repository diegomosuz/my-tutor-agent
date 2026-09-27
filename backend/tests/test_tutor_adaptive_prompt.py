"""Tests puros del prompt builder del tutor con `TutorLearningContext`
(v1.8.0, Bloque 2: "ADAPTIVE TUTOR PROMPTING"). Sin DB, sin Postgres, sin
LLM: `TutorLearningContext` se construye a mano para ejercitar cada
permutación de renderizado de forma aislada y determinística.

Cubre las Partes K (prompt assembly), L (output contract) y M (tests de
prompt) de la especificación del bloque."""
from __future__ import annotations

from app.models.tutor import TutorMessage
from app.prompts.tutor import (
    TUTOR_PROMPT_VERSION,
    TUTOR_SYSTEM_PROMPT,
    build_tutor_messages,
    build_tutor_user_prompt,
)
from app.services.tutor_learning_context import (
    TutorCourseSummary,
    TutorCurrentTopicContext,
    TutorLearningContext,
    TutorReviewTopic,
)

_EMPTY_SUMMARY = TutorCourseSummary(total_topics=0, not_started=0, progressing=0, needs_review=0, mastered=0)


def _context(
    current_topic: TutorCurrentTopicContext | None = None,
    review_topics: list[TutorReviewTopic] | None = None,
    course_summary: TutorCourseSummary | None = None,
) -> TutorLearningContext:
    return TutorLearningContext(
        course_id="curso-demo",
        current_topic=current_topic,
        course_summary=course_summary or _EMPTY_SUMMARY,
        review_topics=review_topics or [],
    )


def _current(status: str, reason_code: str, recent_average: float | None = None, observation_count: int = 0) -> TutorCurrentTopicContext:
    return TutorCurrentTopicContext(
        module_id="modulo-demo",
        topic_id="topico-demo",
        status=status,
        reason_code=reason_code,
        recent_average=recent_average,
        observation_count=observation_count,
    )


def _user_prompt(learning_context: TutorLearningContext | None) -> str:
    return build_tutor_user_prompt(
        message="¿Qué es esto?",
        recent_history=[],
        scene_context=None,
        grounding_packet="=== AUTHORIZED SOURCE: TOPIC ===\n[SRC-001]\ncontenido\n=== END AUTHORIZED SOURCE ===",
        learning_context=learning_context,
    )


# --------------------------------------------------------------------------
# PARTE B / M: versión del prompt
# --------------------------------------------------------------------------


def test_prompt_version_is_v5():
    assert TUTOR_PROMPT_VERSION == "tutor-v5"


def test_system_prompt_contains_all_adaptive_rules():
    for rule in ["REGLA 24", "REGLA 25", "REGLA 26", "REGLA 27", "REGLA 28"]:
        assert rule in TUTOR_SYSTEM_PROMPT


def test_system_prompt_grounding_rules_untouched():
    """Las reglas de grounding de tutor-v4 permanecen intactas -- ninguna
    fue removida ni renumerada al agregar las reglas adaptativas.
    REGLA 22/23 no se chequean acá: viven exclusivamente en
    `_EXPANDED_MODE_RULES` (modo ampliado), nunca en el prompt base."""
    for rule in [f"REGLA {n}" for n in range(1, 22)]:
        assert rule in TUTOR_SYSTEM_PROMPT


# --------------------------------------------------------------------------
# PARTE M: presencia/ausencia del bloque por status
# --------------------------------------------------------------------------


class TestBlockPresenceByStatus:
    def test_not_started_appears_in_prompt(self):
        ctx = _context(_current("not_started", "NOT_STARTED"))
        prompt = _user_prompt(ctx)
        assert "=== ADAPTIVE LEARNING CONTEXT" in prompt
        assert "learning_status: not_started" in prompt
        assert "reason_code: NOT_STARTED" in prompt

    def test_progressing_appears_in_prompt(self):
        ctx = _context(_current("progressing", "STARTED_NOT_COMPLETED"))
        prompt = _user_prompt(ctx)
        assert "learning_status: progressing" in prompt
        assert "reason_code: STARTED_NOT_COMPLETED" in prompt

    def test_needs_review_appears_in_prompt(self):
        ctx = _context(_current("needs_review", "LOW_CERTIFICATION_SCORE", recent_average=45.0, observation_count=2))
        prompt = _user_prompt(ctx)
        assert "learning_status: needs_review" in prompt
        assert "reason_code: LOW_CERTIFICATION_SCORE" in prompt
        assert "recent_average: 45.0" in prompt
        assert "observation_count: 2" in prompt

    def test_mastered_appears_in_prompt(self):
        ctx = _context(_current("mastered", "HIGH_CERTIFICATION_SCORE", recent_average=92.5, observation_count=3))
        prompt = _user_prompt(ctx)
        assert "learning_status: mastered" in prompt
        assert "recent_average: 92.5" in prompt

    def test_no_observations_renders_placeholder_not_a_number(self):
        ctx = _context(_current("not_started", "NOT_STARTED", recent_average=None))
        prompt = _user_prompt(ctx)
        assert "recent_average: (sin evaluaciones)" in prompt


def test_current_topic_none_renders_explicit_fallback():
    ctx = _context(current_topic=None)
    prompt = _user_prompt(ctx)
    assert "current_topic: (sin datos" in prompt
    assert "criterio pedagógico por defecto" in prompt


def test_learning_context_none_omits_block_entirely_backward_compatible():
    """Sin TutorLearningContext (mismo comportamiento que tutor-v4): el
    bloque ADAPTIVE LEARNING CONTEXT no debe aparecer en absoluto."""
    prompt = _user_prompt(None)
    assert "ADAPTIVE LEARNING CONTEXT" not in prompt


def test_messages_without_learning_context_identical_shape_to_v4():
    messages = build_tutor_messages(
        message="hola",
        recent_history=[],
        scene_context=None,
        grounding_packet="packet",
    )
    # El SYSTEM prompt legítimamente menciona "ADAPTIVE LEARNING CONTEXT"
    # (REGLA 24-28 describen el bloque en abstracto, siempre presentes);
    # lo que debe estar ausente es el bloque de DATOS en el USER prompt.
    assert "=== ADAPTIVE LEARNING CONTEXT" not in messages[1]["content"]


# --------------------------------------------------------------------------
# PARTE G / M: review_topics -- needs_review vs progressing nunca igualados
# --------------------------------------------------------------------------


class TestReviewTopicsSemantics:
    def test_empty_review_topics_renders_placeholder(self):
        ctx = _context(_current("progressing", "STARTED_NOT_COMPLETED"), review_topics=[])
        prompt = _user_prompt(ctx)
        assert "review_topics: (ninguno)" in prompt

    def test_mixed_statuses_each_preserve_own_label(self):
        ctx = _context(
            _current("progressing", "STARTED_NOT_COMPLETED"),
            review_topics=[
                TutorReviewTopic(
                    module_id="m1", topic_id="a", module_title="Módulo Uno", topic_title="Tema A",
                    status="needs_review", reason_code="LOW_CERTIFICATION_SCORE", recent_average=30.0,
                ),
                TutorReviewTopic(
                    module_id="m1", topic_id="b", module_title="Módulo Uno", topic_title="Tema B",
                    status="progressing", reason_code="STARTED_NOT_COMPLETED", recent_average=None,
                ),
            ],
        )
        prompt = _user_prompt(ctx)
        assert "- learning_status: needs_review" in prompt
        assert "- learning_status: progressing" in prompt
        assert "module_title: Módulo Uno" in prompt
        assert "topic_title: Tema A" in prompt
        assert "topic_title: Tema B" in prompt

    def test_prompt_never_collectively_labels_review_topics_as_weakness(self):
        """El bloque de DATOS nunca debe agregar una etiqueta colectiva --
        esa interpretación (progressing != debilidad) vive exclusivamente
        en REGLA 27 del system prompt, nunca inyectada en la data misma."""
        ctx = _context(
            _current("mastered", "HIGH_CERTIFICATION_SCORE"),
            review_topics=[
                TutorReviewTopic(
                    module_id="m1", topic_id="b", module_title="Módulo Uno", topic_title="Tema B",
                    status="progressing", reason_code="STARTED_NOT_COMPLETED", recent_average=None,
                ),
            ],
        )
        prompt = _user_prompt(ctx)
        for forbidden in ["temas débiles", "weak topics", "debilidades"]:
            assert forbidden not in prompt.lower()


def test_course_summary_always_rendered():
    ctx = _context(
        _current("mastered", "HIGH_CERTIFICATION_SCORE"),
        course_summary=TutorCourseSummary(total_topics=10, not_started=1, progressing=2, needs_review=3, mastered=4),
    )
    prompt = _user_prompt(ctx)
    assert "not_started: 1" in prompt
    assert "progressing: 2" in prompt
    assert "needs_review: 3" in prompt
    assert "mastered: 4" in prompt


# --------------------------------------------------------------------------
# PARTE H / L: grounding precedence -- el contexto nunca es citable
# --------------------------------------------------------------------------


def test_learning_context_block_never_uses_src_namespaces():
    """El bloque de datos en sí mismo nunca contiene identificadores
    SRC-XXX/COURSE-SRC-XXX -- solo AUTHORIZED SOURCE/COURSE EVIDENCE los
    usan (confirmado también estáticamente por REGLA 28)."""
    ctx = _context(_current("needs_review", "LOW_CERTIFICATION_SCORE", recent_average=40.0, observation_count=1))
    prompt = _user_prompt(ctx)
    start = prompt.index("=== ADAPTIVE LEARNING CONTEXT")
    end = prompt.index("=== END ADAPTIVE LEARNING CONTEXT ===")
    block = prompt[start:end]
    assert "SRC-" not in block


def test_learning_context_appears_before_course_evidence_and_after_course_domain():
    """PARTE 52: orden conceptual -- LEARNING CONTEXT antes de COURSE
    EVIDENCE, después de COURSE DOMAIN, cuando ambos aparecen."""
    from app.prompts.tutor import CourseModuleScope, CourseScope

    ctx = _context(_current("progressing", "STARTED_NOT_COMPLETED"))
    course_scope = CourseScope(course_title="Curso Demo", course_description="", modules=[CourseModuleScope(title="Módulo", topic_titles=["Tema"])])
    prompt = build_tutor_user_prompt(
        message="hola",
        recent_history=[],
        scene_context=None,
        grounding_packet="packet",
        course_scope=course_scope,
        course_evidence_packet="=== COURSE EVIDENCE (otros tópicos) ===\n[COURSE-SRC-001]\nx\n=== END COURSE EVIDENCE ===",
        learning_context=ctx,
    )
    domain_idx = prompt.index("=== COURSE DOMAIN")
    learning_idx = prompt.index("=== ADAPTIVE LEARNING CONTEXT")
    evidence_idx = prompt.index("=== COURSE EVIDENCE")
    assert domain_idx < learning_idx < evidence_idx


# --------------------------------------------------------------------------
# PARTE E / M: privacidad -- serialización completa del prompt
# --------------------------------------------------------------------------


_PROHIBITED_SUBSTRINGS = [
    "email", "user_id", "display_name", "subject", "issuer", "tenant",
    "object_id", "provider", "password", "token", "bearer", "x-dev-user",
    "app_user",
]


def test_full_messages_never_contain_pii_or_identity_metadata():
    ctx = _context(
        _current("needs_review", "REPEATED_LOW_CERTIFICATION_SCORE", recent_average=38.5, observation_count=3),
        review_topics=[
            TutorReviewTopic(
                module_id="m1", topic_id="a", module_title="Fundamentos", topic_title="Introducción",
                status="needs_review", reason_code="LOW_CERTIFICATION_SCORE", recent_average=20.0,
            ),
        ],
        course_summary=TutorCourseSummary(total_topics=4, not_started=1, progressing=1, needs_review=1, mastered=1),
    )
    messages = build_tutor_messages(
        message="¿Qué es esto?",
        recent_history=[TutorMessage(role="user", content="hola")],
        scene_context=None,
        grounding_packet="=== AUTHORIZED SOURCE: TOPIC ===\n[SRC-001]\nx\n=== END AUTHORIZED SOURCE ===",
        learning_context=ctx,
    )
    full_text = (messages[0]["content"] + "\n" + messages[1]["content"]).lower()
    for forbidden in _PROHIBITED_SUBSTRINGS:
        assert forbidden not in full_text, f"campo prohibido encontrado en el prompt: {forbidden}"
