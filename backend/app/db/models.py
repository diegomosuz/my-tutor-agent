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
from typing import Any

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
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


class TopicProgress(Base):
    """Progreso curricular de UN tópico para UN `AppUser` (v1.7.0, Bloque 2).
    PostgreSQL es la fuente de verdad de este dato desde este bloque (antes
    vivía en `localStorage` del navegador -- ver
    docs/SERVER_SIDE_PROFILE_V1_7.md sección "Bloque 2").

    Sin fila = `not_started` (nunca se inserta una fila para un tópico
    jamás iniciado -- decisión documentada: evita escribir basura para la
    inmensa mayoría de tópicos que un alumno nunca abre). `status` solo
    toma dos valores reales: `"in_progress"`/`"completed"` (nunca
    `"not_started"` como valor de columna).

    `course_id`/`module_id`/`topic_id` son los mismos slugs que ya expone
    el repositorio seguro de cursos (`app/services/courses.py`) -- NUNCA
    contenido pedagógico: el Markdown sigue viviendo exclusivamente en el
    filesystem de cursos, esta tabla solo referencia identidad curricular.

    `LearningState` sigue sin persistirse en ningún lado: se deriva del
    lado del frontend a partir de este progreso + evidencia de
    certificación (todavía en `localStorage` en este bloque)."""

    __tablename__ = "topic_progress"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "course_id", "module_id", "topic_id", name="uq_topic_progress_identity"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("app_users.id", ondelete="CASCADE"), nullable=False
    )
    course_id: Mapped[str] = mapped_column(String(255), nullable=False)
    module_id: Mapped[str] = mapped_column(String(255), nullable=False)
    topic_id: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class CertificationAttempt(Base):
    """Intento de práctica/simulacro de certificación YA evaluado
    determinísticamente (v1.7.0, Bloque 3). PostgreSQL es la fuente de
    verdad desde este bloque -- ver docs/SERVER_SIDE_PROFILE_V1_7.md
    sección "Bloque 3".

    NUNCA persiste `question_results` (respuestas individuales/answer
    key/explicaciones por pregunta) -- solo agregados ya públicos, igual
    que el `CertificationAttemptSummary` que el frontend guardaba en
    `localStorage` antes de este bloque.

    `competency_breakdown` (JSONB) es una decisión documentada: siempre se
    lee/escribe como unidad completa por intento (nunca se filtra por
    competencia a nivel SQL), así que una tabla normalizada ahí no aporta
    valor real y no fue pedida explícitamente -- a diferencia de la
    evidencia por tópico (`CertificationTopicResult`), que sí lo fue.

    `origin` distingue evidencia generada por el propio backend
    (`"server_evaluated"`, la única fuente confiable de scores) de
    evidencia histórica migrada desde `localStorage`
    (`"legacy_import"`) -- nunca se usa para dar más o menos peso
    pedagógico, solo es informativo/auditable.

    `UNIQUE(user_id, practice_id)`: `practice_id` ya es un UUID4 generado
    por el backend en `/prepare` (identidad funcional estable de un
    intento) -- esta constraint es lo que hace que reintentar el mismo
    submit (red perdida, etc.) o reimportar el mismo intento legacy nunca
    cree una fila duplicada."""

    __tablename__ = "certification_attempts"
    __table_args__ = (
        UniqueConstraint("user_id", "practice_id", name="uq_certification_attempts_user_practice"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("app_users.id", ondelete="CASCADE"), nullable=False
    )
    course_id: Mapped[str] = mapped_column(String(255), nullable=False)
    practice_id: Mapped[str] = mapped_column(String(64), nullable=False)
    mode: Mapped[str] = mapped_column(String(20), nullable=False)
    total_questions: Mapped[int] = mapped_column(Integer, nullable=False)
    correct_count: Mapped[int] = mapped_column(Integer, nullable=False)
    partially_correct_count: Mapped[int] = mapped_column(Integer, nullable=False)
    incorrect_count: Mapped[int] = mapped_column(Integer, nullable=False)
    unanswered_count: Mapped[int] = mapped_column(Integer, nullable=False)
    score_percent: Mapped[float] = mapped_column(Float, nullable=False)
    competency_breakdown: Mapped[list[Any]] = mapped_column(JSONB, nullable=False)
    origin: Mapped[str] = mapped_column(String(20), nullable=False)
    attempted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    topic_results: Mapped[list["CertificationTopicResult"]] = relationship(
        back_populates="attempt", cascade="all, delete-orphan"
    )


class CertificationTopicResult(Base):
    """Evidencia por tópico de UN `CertificationAttempt` (v1.7.0, Bloque
    3). `module_id`+`topic_id` (nunca `topic_id` solo -- un slug de tópico
    puede repetirse entre módulos distintos, ver
    `app/services/certification_service.py`) identifican el tópico dentro
    del intento. `UNIQUE(attempt_id, module_id, topic_id)`: una sola fila
    de evidencia por tópico por intento."""

    __tablename__ = "certification_topic_results"
    __table_args__ = (
        UniqueConstraint(
            "attempt_id", "module_id", "topic_id", name="uq_certification_topic_results_identity"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    attempt_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("certification_attempts.id", ondelete="CASCADE"), nullable=False
    )
    module_id: Mapped[str] = mapped_column(String(255), nullable=False)
    topic_id: Mapped[str] = mapped_column(String(255), nullable=False)
    attempted: Mapped[int] = mapped_column(Integer, nullable=False)
    correct: Mapped[int] = mapped_column(Integer, nullable=False)
    partially_correct: Mapped[int] = mapped_column(Integer, nullable=False)
    incorrect: Mapped[int] = mapped_column(Integer, nullable=False)
    unanswered: Mapped[int] = mapped_column(Integer, nullable=False)
    score_percent: Mapped[float] = mapped_column(Float, nullable=False)

    attempt: Mapped[CertificationAttempt] = relationship(back_populates="topic_results")
