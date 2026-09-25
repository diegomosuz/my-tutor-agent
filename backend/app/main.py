import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.config import get_settings
from app.middleware import RequestIDMiddleware, SecurityHeadersMiddleware
from app.routers import ai, certification, courses, health, me, progress, speech, system

# Configura un handler básico para que los logs de la app (ej.
# "pwc_tutor.lesson": lesson_generation_started/completed/failed,
# lesson_cache_hit/miss, ver app/services/lesson_generator.py) aparezcan
# realmente en stdout/docker logs. Sin esto, un logger sin handler propio
# hereda el nivel WARNING del root logger por defecto y los .info(...) se
# descartan en silencio. Nunca se loguean API keys, Authorization, el
# prompt completo ni el Grounding Packet completo (ver ese módulo).
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

settings = get_settings()

app = FastAPI(
    title="PwC AI Tutor API",
    description="API REST del aula virtual inteligente PwC AI Tutor.",
    version=settings.app_version,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    # POST habilitado desde Fase 3 (generación de LessonPlan). PUT/DELETE
    # habilitados desde v1.7.0 Bloque 2 (progreso curricular server-side,
    # ver app/routers/progress.py) -- bug real de QA encontrado antes de
    # tocar el frontend: sin esto, un browser real bloquea el preflight de
    # PUT/DELETE por CORS aunque curl/TestClient nunca lo noten (CORS es
    # una política que solo el navegador aplica).
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)
# Orden: SecurityHeaders y RequestID se aplican a toda respuesta, incluidas
# las de error (Starlette ejecuta middleware de afuera hacia adentro).
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestIDMiddleware)

_db_logger = logging.getLogger("pwc_tutor.db")


@app.exception_handler(SQLAlchemyError)
async def handle_unexpected_db_error(request: Request, exc: SQLAlchemyError) -> JSONResponse:
    """Red de seguridad global (v1.7.0, bug real de QA: sin esto, un
    Postgres caído durante una query/escritura no cubierta por un
    try/except local -- ej. app/routers/progress.py -- producía un 500
    crudo en vez de un 503 claro, mismo bug ya corregido puntualmente en
    app/dependencies.py para la resolución de identidad). Nunca filtra el
    mensaje crudo de SQLAlchemy (podría incluir la cadena de conexión) ni
    depende de que cada router recuerde envolver su propio try/except."""
    _db_logger.warning("unhandled_db_error error_type=%s path=%s", type(exc).__name__, request.url.path)
    return JSONResponse(
        status_code=503,
        content={"detail": "La base de datos no está disponible en este momento. Intentá nuevamente más tarde."},
    )


app.include_router(health.router)
app.include_router(courses.router)
app.include_router(ai.router)
app.include_router(certification.router)
app.include_router(speech.router)
app.include_router(system.router)
app.include_router(me.router)
app.include_router(progress.router)
