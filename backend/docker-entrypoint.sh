#!/bin/sh
# v1.7.0: aplica migraciones de Alembic ANTES de arrancar el servidor.
# `set -e` garantiza fail-fast: si `alembic upgrade head` falla, el
# container nunca llega a levantar uvicorn como si estuviera listo (PASO
# 39: una migración fallida nunca debe dejar el backend sirviendo
# requests contra un schema desactualizado/inconsistente).
set -e

alembic upgrade head

exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
