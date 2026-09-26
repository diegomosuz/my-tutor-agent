"""create certification_attempts and certification_topic_results

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-25

Historial de Certification + evidencia por tópico (v1.7.0, Bloque 3).
Nunca persiste question_results/answer key/respuestas individuales (ver
app/services/certification_history_service.py). `competency_breakdown` es
un JSONB denormalizado (decisión documentada en
docs/SERVER_SIDE_PROFILE_V1_7.md sección Bloque 3: siempre se lee/escribe
como unidad completa por intento, nunca se filtra por competencia a nivel
SQL -- una tabla normalizada ahí no aporta valor real y no fue pedida
explícitamente, a diferencia de la evidencia por tópico).
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "certification_attempts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("app_users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("course_id", sa.String(length=255), nullable=False),
        sa.Column("practice_id", sa.String(length=64), nullable=False),
        sa.Column("mode", sa.String(length=20), nullable=False),
        sa.Column("total_questions", sa.Integer(), nullable=False),
        sa.Column("correct_count", sa.Integer(), nullable=False),
        sa.Column("partially_correct_count", sa.Integer(), nullable=False),
        sa.Column("incorrect_count", sa.Integer(), nullable=False),
        sa.Column("unanswered_count", sa.Integer(), nullable=False),
        sa.Column("score_percent", sa.Float(), nullable=False),
        sa.Column("competency_breakdown", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("origin", sa.String(length=20), nullable=False),
        sa.Column("attempted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "practice_id", name="uq_certification_attempts_user_practice"),
    )
    # Query principal: historial de un curso para el usuario actual,
    # ordenado por fecha -- distinto del prefijo de la UNIQUE (user_id,
    # practice_id), así que sí hace falta un índice separado acá (nunca
    # redundante, a diferencia de topic_progress).
    op.create_index(
        "ix_certification_attempts_user_course_attempted_at",
        "certification_attempts",
        ["user_id", "course_id", "attempted_at"],
    )

    op.create_table(
        "certification_topic_results",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "attempt_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("certification_attempts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("module_id", sa.String(length=255), nullable=False),
        sa.Column("topic_id", sa.String(length=255), nullable=False),
        sa.Column("attempted", sa.Integer(), nullable=False),
        sa.Column("correct", sa.Integer(), nullable=False),
        sa.Column("partially_correct", sa.Integer(), nullable=False),
        sa.Column("incorrect", sa.Integer(), nullable=False),
        sa.Column("unanswered", sa.Integer(), nullable=False),
        sa.Column("score_percent", sa.Float(), nullable=False),
        sa.UniqueConstraint(
            "attempt_id", "module_id", "topic_id", name="uq_certification_topic_results_identity"
        ),
    )


def downgrade() -> None:
    op.drop_table("certification_topic_results")
    op.drop_index("ix_certification_attempts_user_course_attempted_at", table_name="certification_attempts")
    op.drop_table("certification_attempts")
