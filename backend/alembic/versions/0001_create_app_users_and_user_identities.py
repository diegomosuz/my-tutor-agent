"""create app_users and user_identities

Revision ID: 0001
Revises:
Create Date: 2026-09-25

Identidad de aplicación (v1.7.0, Bloque 1). Ninguna columna de
credenciales (password/hash/salt/reset_token) -- ver
tests/test_no_password_schema.py. `email` es informativo, nunca UNIQUE
(ver docstring de AppUser en app/db/models.py).
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "app_users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("display_name", sa.String(length=200), nullable=True),
        sa.Column("email", sa.String(length=320), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "user_identities",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("app_users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("provider", sa.String(length=50), nullable=False),
        sa.Column("issuer", sa.String(length=255), nullable=True),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column("tenant_id", sa.String(length=255), nullable=True),
        sa.Column("external_object_id", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("provider", "issuer", "subject", name="uq_user_identities_provider_issuer_subject"),
    )
    op.create_index("ix_user_identities_user_id", "user_identities", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_user_identities_user_id", table_name="user_identities")
    op.drop_table("user_identities")
    op.drop_table("app_users")
