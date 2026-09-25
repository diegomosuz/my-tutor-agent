"""PASO 57/58: los logs de identidad nunca deben incluir la password, la
DATABASE_URL completa, ni el valor crudo del header X-Dev-User más allá de
lo estrictamente necesario -- en la práctica, ni siquiera se loguea el
`subject`, solo `user_id`/`provider`/`created` (más estricto que lo
mínimo pedido)."""
from __future__ import annotations

import logging


def test_identity_resolved_log_never_contains_password_or_database_url(client, caplog):
    with caplog.at_level(logging.INFO, logger="pwc_tutor.identity"):
        response = client.get("/api/me", headers={"X-Dev-User": "student-logging-test"})
    assert response.status_code == 200
    assert "identity_resolved" in caplog.text
    assert "pwc_tutor_dev_password" not in caplog.text
    assert "postgresql" not in caplog.text
    assert "student-logging-test" not in caplog.text


def test_db_reachability_failure_log_never_contains_connection_details(caplog):
    from app.db.session import check_db_reachable

    with caplog.at_level(logging.INFO, logger="pwc_tutor.db"):
        result = check_db_reachable(
            "postgresql+psycopg://baduser:badpass@nonexistent-host-pwc-tutor:5432/nodb"
        )
    assert result is False
    assert "db_reachability_check_failed" in caplog.text
    assert "badpass" not in caplog.text
    assert "baduser" not in caplog.text
