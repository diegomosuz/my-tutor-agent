"""Tests de `app/services/identity_provider.py` (v1.7.0, Bloque 1):
`DevIdentityProvider`, validación del header `X-Dev-User` y la factory
`get_identity_provider` (AUTH_MODE)."""
from __future__ import annotations

import pytest
from starlette.requests import Request

from app.services.identity_provider import (
    DevIdentityProvider,
    IdentityConfigurationError,
    IdentityHeaderInvalidError,
    get_identity_provider,
)


def _make_request(headers: dict[str, str] | None = None) -> Request:
    raw_headers = [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()]
    return Request({"type": "http", "headers": raw_headers})


def test_dev_provider_defaults_to_stable_subject_without_header():
    principal = DevIdentityProvider().resolve(_make_request())
    assert principal.provider == "dev"
    assert principal.subject == "dev-user-default"
    assert principal.issuer == "pwc-ai-tutor-local"


def test_dev_provider_uses_header_when_present():
    principal = DevIdentityProvider().resolve(_make_request({"X-Dev-User": "student-a"}))
    assert principal.subject == "student-a"


def test_dev_provider_trims_whitespace_in_header():
    principal = DevIdentityProvider().resolve(_make_request({"X-Dev-User": "  student-a  "}))
    assert principal.subject == "student-a"


def test_dev_provider_repeated_header_is_deterministic():
    p1 = DevIdentityProvider().resolve(_make_request({"X-Dev-User": "student-a"}))
    p2 = DevIdentityProvider().resolve(_make_request({"X-Dev-User": "student-a"}))
    assert p1.subject == p2.subject == "student-a"


def test_dev_provider_rejects_empty_header():
    with pytest.raises(IdentityHeaderInvalidError):
        DevIdentityProvider().resolve(_make_request({"X-Dev-User": ""}))


def test_dev_provider_rejects_header_over_length_limit():
    with pytest.raises(IdentityHeaderInvalidError):
        DevIdentityProvider().resolve(_make_request({"X-Dev-User": "a" * 200}))


def test_dev_provider_rejects_header_with_unsafe_characters():
    with pytest.raises(IdentityHeaderInvalidError):
        DevIdentityProvider().resolve(_make_request({"X-Dev-User": "student a"}))
    with pytest.raises(IdentityHeaderInvalidError):
        DevIdentityProvider().resolve(_make_request({"X-Dev-User": "../etc/passwd"}))
    with pytest.raises(IdentityHeaderInvalidError):
        DevIdentityProvider().resolve(_make_request({"X-Dev-User": "<script>alert(1)</script>"}))


def test_get_identity_provider_dev_is_case_insensitive():
    assert isinstance(get_identity_provider("dev"), DevIdentityProvider)
    assert isinstance(get_identity_provider("DEV"), DevIdentityProvider)
    assert isinstance(get_identity_provider(" dev "), DevIdentityProvider)


def test_get_identity_provider_entra_is_explicitly_not_implemented():
    """PASO 19/23/64: AUTH_MODE=entra nunca debe caer en un fallback
    silencioso a DevIdentityProvider ni fingir soportar Entra -- debe
    fallar explícitamente."""
    with pytest.raises(IdentityConfigurationError, match="entra"):
        get_identity_provider("entra")


def test_get_identity_provider_rejects_unsupported_value():
    with pytest.raises(IdentityConfigurationError):
        get_identity_provider("saml")


def test_get_identity_provider_rejects_empty_value():
    with pytest.raises(IdentityConfigurationError):
        get_identity_provider("")
