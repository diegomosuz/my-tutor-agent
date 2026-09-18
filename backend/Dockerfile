FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY tests ./tests
COPY pytest.ini .

# Usuario no-root (Fase 7, sección 43). /app/data es un bind mount del
# host (docker-compose.yml): el UID del container no necesita coincidir
# con el del host para poder escribir ahí en Docker Desktop (Windows/WSL2)
# — solo importa para archivos que vivan DENTRO de la imagen.
RUN useradd --create-home --uid 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
