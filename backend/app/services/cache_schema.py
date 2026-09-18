"""Versión de esquema de cache compartida (Fase 7).

Cambiar esta constante invalida limpiamente TODAS las caches de filesystem
(LessonPlan, QuestionBank, speech) de una sola vez, sin necesitar un
sistema de migraciones: las caches son desechables por diseño (ver
docs/ARCHITECTURE.md). Se usa junto a la identidad de contenido/contexto
de cada cache, nunca sola.
"""
CACHE_SCHEMA_VERSION = "cache-v2"
