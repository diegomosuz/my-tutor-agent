"""Modelos ORM de SQLAlchemy (v1.7.0, Bloque 1: identidad).

Separados deliberadamente de `app/models/*.py` (esquemas Pydantic del
contrato de la API): estos son objetos de persistencia, nunca se exponen
directamente en una respuesta HTTP (ver `app/models/identity.py` para el
esquema público de `/api/me`).

Regla dura (CLAUDE.md v1.7.0, PASO 15): estas tablas son mapeos
funcionales a una identidad externa YA confiable -- nunca un almacén de
credenciales. Ninguna columna de este archivo puede llamarse o significar
`password`/`password_hash`/`password_salt`/`reset_token` (ver
`tests/test_no_password_schema.py`, que audita esto contra el metadata
real, no contra el texto de este archivo).
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class AppUser(Base):
    """Usuario funcional de la aplicación (`app_user.id` es lo único que el
    resto del dominio debe conocer -- nunca email/Entra Object ID/tenant/
    provider/claims crudos, ver docs/SERVER_SIDE_PROFILE_V1_7.md).

    `email` es un ATRIBUTO informativo, nunca la clave de identidad ni un FK
    (una identidad Entra puede tener alias, cambiar de email, o pertenecer a
    otro tenant con el mismo email -- nunca se asume unicidad global de
    email como requisito de identidad)."""

    __tablename__ = "app_users"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    display_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    identities: Mapped[list["UserIdentity"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class UserIdentity(Base):
    """Mapeo de una identidad EXTERNA ya confiable (hoy: `DevIdentityProvider`;
    a futuro: Microsoft Entra ID) hacia un `AppUser` interno. Nunca es una
    base de datos de autenticación: no valida credenciales, solo registra a
    qué usuario funcional corresponde una identidad que el `IdentityProvider`
    ya autenticó.

    Unicidad por `(provider, issuer, subject)`: es la clave estable de una
    identidad externa (nunca `display_name`/`email`, ver AppUser). `issuer`
    es nullable (algún proveedor futuro podría no tener un issuer de tipo
    JWT) -- limitación conocida y aceptada: Postgres trata cada `NULL` como
    distinto en una UNIQUE constraint, por lo que la unicidad estructural de
    la constraint solo aplica mientras `issuer` tenga un valor concreto.
    `DevIdentityProvider` siempre asigna un `issuer` fijo no nulo
    (`"pwc-ai-tutor-local"`), así que esta limitación no aplica en la
    práctica en esta versión."""

    __tablename__ = "user_identities"
    __table_args__ = (
        UniqueConstraint("provider", "issuer", "subject", name="uq_user_identities_provider_issuer_subject"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("app_users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    issuer: Mapped[str | None] = mapped_column(String(255), nullable=True)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    tenant_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    external_object_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[AppUser] = relationship(back_populates="identities")
