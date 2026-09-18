import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import ai, certification, courses, health

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
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    # POST habilitado desde Fase 3 (generación de LessonPlan).
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(courses.router)
app.include_router(ai.router)
app.include_router(certification.router)
