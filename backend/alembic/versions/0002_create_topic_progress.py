"""create topic_progress

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-25

Progreso curricular por tópico (v1.7.0, Bloque 2). Sin fila = not_started
(nunca se inserta una fila para un tópico jamás iniciado, ver
app/services/topic_progress_service.py); `status` solo toma
"in_progress"/"completed". `course_id`/`module_id`/`topic_id` son
referencias (slugs), nunca contenido -- el Markdown sigue viviendo
exclusivamente en el filesystem de cursos.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "topic_progress",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("app_users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("course_id", sa.String(length=255), nullable=False),
        sa.Column("module_id", sa.String(length=255), nullable=False),
        sa.Column("topic_id", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        # UNIQUE con (user_id, course_id, ...) como prefijo sirve TAMBIÉN
        # como índice eficiente para "GET progreso de un curso" (WHERE
        # user_id=? AND course_id=?) -- un índice adicional sería
        # redundante (ver PASO 65 de la especificación: "no over-indexing").
        sa.UniqueConstraint(
            "user_id", "course_id", "module_id", "topic_id", name="uq_topic_progress_identity"
        ),
    )


def downgrade() -> None:
    op.drop_table("topic_progress")
