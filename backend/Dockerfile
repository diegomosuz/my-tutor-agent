FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY tests ./tests
COPY pytest.ini .
COPY alembic ./alembic
COPY alembic.ini .
COPY docker-entrypoint.sh .

# Usuario no-root (Fase 7, sección 43). /app/data es un bind mount del
# host (docker-compose.yml): el UID del container no necesita coincidir
# con el del host para poder escribir ahí en Docker Desktop (Windows/WSL2)
# — solo importa para archivos que vivan DENTRO de la imagen.
RUN useradd --create-home --uid 1000 appuser \
    && chmod +x docker-entrypoint.sh \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# v1.7.0: aplica migraciones de Alembic (fail-fast) antes de levantar
# uvicorn -- ver docker-entrypoint.sh. `docker compose run backend pytest`
# sigue funcionando igual: pasar un comando explícito a `run`/`exec`
# reemplaza el CMD por completo (nunca corre el entrypoint de migración).
CMD ["./docker-entrypoint.sh"]
