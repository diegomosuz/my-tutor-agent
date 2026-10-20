# CONTEXT.md — Base de contexto entre sesiones Claude

> Este archivo es **incremental**: se actualiza al cerrar cada etapa
> nueva del proyecto (bloque funcional, hardening, release). No
> reemplaza a [`CLAUDE.md`](./CLAUDE.md) (el contrato de reglas duras,
> con prioridad sobre todo lo demás) — lo complementa con una vista
> rápida de orientación: qué es esto, dónde estamos, cómo se trabaja acá.
> Ver la sección final ["Cómo mantener este archivo"](#cómo-mantener-este-archivo)
> antes de editarlo.

## 1. Qué es este proyecto

**PwC AI Tutor**: aula virtual inteligente para cursos técnicos.
Jerarquía `Curso → Módulos → Tópicos`, cada tópico es un archivo
Markdown que es la **única fuente de verdad**. Un LLM puede reorganizar,
resumir, explicar, generar diagramas/slides/narración/preguntas — pero
**nunca** puede introducir conocimiento externo al Markdown de origen.
Toda afirmación pedagógica generada debe ser trazable a referencias
`SRC-XXX` reales del contenido (regla de grounding, ver `CLAUDE.md`
sección 2 — es la regla más importante de todo el proyecto).

## 2. Stack tecnológico

- **Frontend**: React + TypeScript + Vite, sin librería de estado
  global (hooks `useState`/`useEffect` planos).
- **Backend**: Python 3.11 + FastAPI + Pydantic.
- **Infraestructura**: Docker + Docker Compose. Todo corre encapsulado
  — no hace falta Python/Node instalados en el host.
- **Persistencia**: ninguna base de datos. El contenido vive en el
  filesystem de cursos (montado read-only); el progreso del alumno vive
  en `localStorage`/`sessionStorage` del navegador (local-first, sin
  usuarios/auth/sync entre dispositivos).
- **Explícitamente prohibido** (salvo pedido explícito del usuario):
  Kubernetes, PostgreSQL/MongoDB/Redis, RabbitMQ/Celery, LangChain/
  LangGraph, bases de datos vectoriales, microservicios, event buses.

## 3. Arquitectura en una vista

```
browser → React → HTTP REST → FastAPI → filesystem de cursos + proveedores LLM
```

Pipeline de contenido (determinístico, sin LLM):
```
Markdown (tópico) → SourceBlock[] (canonical.py) → CanonicalTopicContent
  → Grounding Packet (texto plano, única fuente entregada a un LLM)
```

Pipeline de generación (con LLM, siempre grounded):
```
Grounding Packet → Prompt Builder → LLMProvider.generate_structured(...)
  → GeneratedLessonBody → validate_lesson_body (grounding) → LessonPlan
  → cache en filesystem (key = content_sha256+provider+model+prompt_version)
```

Pipeline de aprendizaje (v1.1.0+, 100% frontend, determinístico, sin LLM):
```
Learning Progress (localStorage) + Certification History
  → TopicLearningSignal → LearningState (v1.6.0)
  → Learning Insights ("Mi aprendizaje") → Guided Review
  → Certification real (scoped) → Learning-State Refresh
```

Detalle completo de cada pieza: `docs/ARCHITECTURE.md`. Contrato de
reglas duras por sección funcional: `CLAUDE.md`.

## 4. Estado actual

**Versión publicada**: `v1.6.0` — `master`/`origin/master`/tag `v1.6.0`
apuntan a `61daa72942784b9b4bd056c0667e72006c4fee25`. `APP_VERSION=1.6.0`,
`LESSON_PROMPT_VERSION=lesson-v3.3.1`, `TUTOR_PROMPT_VERSION=tutor-v4`.

**Qué hace la app hoy** (de punta a punta): catálogo → detalle de curso
→ aula virtual con clase generada por IA grounded (slides, narración,
voz neural u del navegador, animaciones pedagógicas) → tutor
bidireccional grounded (con contexto de curso completo vía retrieval
lexical determinístico) → checkpoints → Guided Markdown Read Aloud →
práctica/simulacro de certificación grounded → "Mi aprendizaje"
(progreso, `LearningState` por tópico, Guided Review, cierre del loop
de verificación con Certification real).

**No existe todavía**: base de datos, autenticación, persistencia
server-side de ningún tipo, RAG/embeddings/vector DB, agentes
autónomos, sincronización entre dispositivos, historial de repasos,
Tutor que consuma `LearningState`, evaluación subjetiva con LLM.

## 5. Cómo llegamos hasta acá (resumen — detalle completo en `CLAUDE.md` sección 14)

| Versión | Foco | Commit/tag |
|---|---|---|
| Fase 1-7 (pre-v1.0.0) | Catálogo → grounding → LLM real → Classroom Engine → Tutor+Checkpoints → Certification → hardening | — |
| v1.0.0 | Release candidate inicial, auditoría de producto | `267c08c` |
| v1.0.1 | Fix real: `502` engañoso en certificación con curso grande | `f5a1a50` |
| v1.1.0 | "Mi aprendizaje", performance (concurrencia+singleflight), `lesson-v3`, Adaptive Learning | `63feb5a` |
| v1.1.1 | — | `0b1f8db` |
| v1.2.0 | Visual Fidelity (`lesson-v3.1`), Visual Selection Reliability, Pedagogical Animations v1 | `71dbaaf` |
| v1.3.0 | Voice lifecycle, Structure-Aware Lessons (`lesson-v3.3.1`), Tutor a nivel de curso (`tutor-v3.3`) | `e7cb4dc` |
| v1.4.0 | Course-Wide Grounded Tutor (retrieval lexical determinístico, `tutor-v4`) | `3542a40` |
| v1.5.0 | Guided Markdown Read Aloud | `19b4ef0` |
| **v1.6.0** | **Learning Intelligence & Guided Review** (`LearningState`, Guided Review Session, cierre del loop con Certification real) | `61daa72` |

Cada versión ≥v1.1.0 tiene su propio `docs/RELEASE_NOTES_vX.Y.Z.md` y,
cuando el feature lo amerita, un doc de diseño dedicado (ver mapa en
sección 7). `docs/ROADMAP.md` quedó desactualizado después de v1.1.0
(sigue hablando de "Fase 8/9/10" con nombres viejos) — **la fuente de
verdad de qué se implementó es `CLAUDE.md` sección 14**, no ROADMAP.md.

## 6. Proceso de desarrollo (el "ritual" de este proyecto)

Este proyecto sigue un flujo de release muy disciplinado y explícito,
repetido versión tras versión. Vale la pena conocerlo porque el usuario
lo pide en ese orden, con ese nivel de detalle, cada vez:

1. **Bloques funcionales** (uno o varios por versión): cada bloque es
   una rama `feat/vX.Y.Z-<nombre>` con auditoría previa obligatoria
   (leer el código real antes de proponer diseño), implementación,
   tests exhaustivos (unitarios + integración, reales — nunca mockear
   la lógica de negocio que se está probando), y **QA real** contra un
   curso real del filesystem con LLM configurado (Playwright headless
   contra `http://localhost:5173`/`http://localhost:8000`, nunca contra
   mocks). Termina en UN commit por bloque (`feat: ...`) y un reporte
   final punto por punto contra los criterios de aprobación que el
   usuario define en el pedido.
2. **Hardening**: rama nueva `release/vX.Y.Z-rc` desde el último bloque.
   Auditoría del diff acumulado completo (`vPREV..HEAD`, todos los
   bloques juntos, no solo el último commit) buscando defectos reales
   (nunca refactors cosméticos): debug code, secrets, artefactos de QA,
   dead code, drift en archivos "congelados". Bump de versión
   (`APP_VERSION` en sus 3 ubicaciones canónicas:
   `backend/app/config.py`, `docker-compose.yml`, `.env.example`).
   `docker compose build --no-cache` + `doctor.ps1` + al menos una
   corrida limpia completa de tests backend/frontend + build. Termina
   en UN commit (`chore: prepare vX.Y.Z release candidate`).
3. **Release Gate**: el último control antes de publicar, sobre el
   commit exacto del RC (nunca se crean commits nuevos acá — si aparece
   un blocker real, se sale del gate, se corrige, se crea un nuevo RC y
   se repite el gate completo). Re-verifica invariantes de git
   (fast-forward eligibility, cadena de commits exacta, sin merges),
   re-corre QA real end-to-end, y termina con una recomendación
   explícita: `READY FOR vX.Y.Z RELEASE` o `NOT READY`.
4. **Publicación**: solo si el gate dio PASS. `git fetch` para
   confirmar que `origin/master` no cambió, `git merge --ff-only` (nunca
   merge commit), push de `master`, verificar que el tag no exista
   todavía, crear tag anotado, push del tag, `gh release create` con
   `docs/RELEASE_NOTES_vX.Y.Z.md`, verificar que el body del release
   coincida con el archivo (solo se tolera diferencia cosmética de
   newline al final). Todos los tags/releases anteriores son
   **inmutables** — un bug encontrado después va en `vX.Y.(Z+1)`.

**Verificación por hash, no por confianza**: en cada paso el usuario
pide HEADs/tags exactos y espera que se verifiquen con `git rev-parse`
antes de actuar — nunca asumir que el estado es el esperado.

**QA real, no simulado**: cuando el usuario pide "QA real", significa
Playwright contra los containers Docker corriendo de verdad, con un
proveedor LLM configurado, contra un curso real del filesystem (no un
curso de test armado a mano) — sembrar `localStorage`/`sessionStorage`
vía `page.evaluate` está bien para preparar el escenario, pero las
llamadas a Certification/Lesson/Tutor tienen que ser reales.

**Nunca push/tag/merge sin que el usuario lo pida explícitamente** en
esos términos — los pasos de hardening y desarrollo de bloques nunca
publican nada por su cuenta.

## 7. Mapa de documentación

- `CLAUDE.md` — contrato permanente, reglas duras, "Estado de fases"
  (changelog completo y autoritativo).
- `docs/ARCHITECTURE.md` — arquitectura detallada, diagramas de flujo.
- `docs/CONFIGURATION.md` — variables de entorno.
- `docs/COURSE_FORMAT.md` — formato esperado de un curso en el
  filesystem.
- `docs/LEARNING_PROGRESS.md` (v1.1.0), `docs/ADAPTIVE_LEARNING.md`
  (v1.1.0), `docs/LEARNING_INTELLIGENCE_V1_6.md` (v1.6.0, el más
  reciente y detallado — auditoría de evidencia, `LearningState`,
  Guided Review, Verification, hardening) — la trilogía de "Mi
  aprendizaje".
- `docs/LESSON_RENDERING.md` / `docs/VISUAL_FIDELITY.md` /
  `docs/VISUAL_SELECTION.md` / `docs/PEDAGOGICAL_ANIMATIONS.md` /
  `docs/STRUCTURE_AWARE_LESSONS.md` — evolución del renderer de clases
  y de la generación de `LessonPlan`.
- `docs/COURSE_GROUNDED_TUTOR_V1_4.md` / `docs/CLASSROOM_UX_V1_3.md` —
  Tutor a nivel de curso, navegación del aula.
- `docs/GUIDED_READ_ALOUD_V1_5.md` — lectura en voz alta del Markdown.
- `docs/PERFORMANCE.md` — concurrencia, singleflight.
- `docs/PRODUCT_AUDIT.md`, `docs/RELEASE_CHECKLIST.md` — auditoría de
  Fase 8, checklist reproducible de release.
- `docs/RELEASE_NOTES_vX.Y.Z.md` — una por versión desde v1.0.0.
- `docs/ROADMAP.md` — **desactualizado post-v1.1.0**, no confiar en él
  para saber qué está implementado.

## 8. Ideas pendientes / próximos pasos conocidos

Documentado explícitamente como fuera de alcance en releases recientes,
no comprometido a ninguna fecha:

- Tutor que consuma `LearningState` para adaptar sus respuestas.
- Historial persistente de repasos guiados (Guided Review).
- Unificar `RecommendedForYou` (v1.1.0) con Learning Insights (v1.6.0)
  — redundancia conocida, documentada, deliberadamente no resuelta
  todavía.
- Persistencia server-side de resultados de certificación (evaluado en
  cada release, siempre descartado por ahora — local-first alcanza).
- Diagramas más ricos (tipo Mermaid) para `process`/`hierarchy`/
  `architecture`/`concept_map` cuando el `VisualPlan` lo justifique.
- Preguntas de certificación de desarrollo corto con evaluación
  asistida por LLM (mencionado, nunca implementado, mantendría el
  grounding estricto).

## Cómo mantener este archivo

- Actualizar la sección 4 ("Estado actual") cada vez que se publique
  una versión nueva.
- Agregar una fila a la tabla de la sección 5 en cada release
  (commit/tag + una frase del foco principal — el detalle completo va
  en `CLAUDE.md` y en `docs/RELEASE_NOTES_vX.Y.Z.md`, no acá).
- Si el "ritual" de la sección 6 cambia (el usuario pide un paso nuevo,
  salta uno, cambia el orden), actualizar esa sección para que la
  próxima sesión no asuma el proceso viejo.
- Mantener la sección 8 honesta: mover un ítem de acá al changelog de
  `CLAUDE.md` cuando efectivamente se implemente, nunca dejarlo
  duplicado en los dos lados.
- Este archivo se mantiene deliberadamente corto (orientación rápida,
  no un changelog exhaustivo) — si una sección empieza a duplicar el
  detalle de `CLAUDE.md`, recortarla y dejar el pointer.
