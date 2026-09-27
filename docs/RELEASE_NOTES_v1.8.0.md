# Release Notes — v1.8.0 — Adaptive Tutor

**Adaptive Tutor.** Release candidate sobre v1.7.0. El Tutor
conversacional grounded (Fase 5) empieza a adaptar su enseñanza al
estado de aprendizaje real del alumno — determinado siempre por
PostgreSQL, nunca por el LLM — y gana comprobaciones formativas breves
y efímeras (micro-checks). Sin cambios a Lesson Generation,
Certification, Guided Review, Checkpoints existentes ni al resto del
producto: este release es exclusivamente sobre el Tutor.

Cinco bloques funcionales (Adaptive Tutor Context Foundation, Adaptive
Tutor Prompting, Deterministic Adaptive Teaching Policy, Adaptive
Interaction & Formative Micro-Checks, Product Hardening & Pedagogical
E2E Validation) más este RC. Ver
[`docs/ADAPTIVE_TUTOR_V1_8.md`](./ADAPTIVE_TUTOR_V1_8.md) para el
detalle técnico completo (arquitectura, contratos, QA real de cada
bloque) — este documento resume lo que importa para decidir el upgrade.

## What's New

1. **Adaptive Tutor Context Foundation** — `TutorLearningContext`,
   derivado 100% determinísticamente de `LearningProfileService` (el
   mismo `LearningState` de v1.7.0): estado del tópico actual + hasta 5
   tópicos a repasar, acotado, sin PII.
2. **Server-side learning-aware Tutor** — el Tutor conversacional
   (`tutor-v7`) recibe ese contexto en cada consulta, resuelto siempre
   server-side vía la misma identidad (`get_current_app_user`) que ya
   usa `GET .../learning-profile` — nunca aceptado del cliente.
3. **Deterministic Teaching Policy** — `TutorTeachingPolicy`, seis
   dimensiones pedagógicas cerradas (scaffold, profundidad, refuerzo de
   prerequisitos, complejidad de ejemplos, comprobación de comprensión,
   modo de progresión), derivadas sin LLM directamente de
   `TutorLearningContext`. Decide QUÉ estrategia corresponde; el LLM
   solo la EXPRESA.
4. **Adaptive Interaction Policy** — `TutorInteractionPolicy`, deriva
   sin LLM CUÁNDO es razonable ofrecer una comprobación formativa
   (`encouraged`/`optional`/`on_request_only`), a partir de la misma
   Teaching Policy.
5. **Formative Micro-Checks** — el Tutor puede incluir, opcionalmente
   (máximo uno por respuesta), una pregunta breve grounded exclusivamente
   en el tópico actual (`TutorMicroCheck`), sin answer key ni score
   expuestos.
6. **Grounded Formative Feedback** — un endpoint dedicado
   (`POST .../tutor/micro-check/feedback`, prompt propio
   `microcheck-feedback-v1`) evalúa la respuesta del alumno contra el
   material real del curso y devuelve un veredicto formativo
   (`correct`/`partially_correct`/`needs_revision`/`unclear`) + feedback
   grounded breve.
7. **Aislamiento multiusuario** — confirmado con Postgres real: dos
   alumnos con `LearningState` distinto reciben contextos/políticas
   distintos para la misma pregunta; ningún dato de un alumno puede
   contaminar a otro.
8. **Security/privacy hardening** — batería dedicada de prompt-injection
   (pregunta del micro-check y respuesta del alumno tratadas siempre
   como dato, nunca instrucción) y de salida malformada del proveedor
   (campos faltantes/inválidos rechazados; campos peligrosos como
   `score`/`answer_key`/`mastered` ignorados silenciosamente).
9. **Pedagogical E2E validation** — un bloque completo (Bloque 5)
   dedicado exclusivamente a demostrar, con Postgres y proveedor LLM
   reales, que la cadena completa es correcta, segura y nunca muta
   `LearningState` — documentado en detalle con evidencia real, sin
   encontrar ningún bug de producto.

## Important Architecture

```
PostgreSQL Evidence (topic_progress + certification_attempts, v1.7.0)
    ↓
LearningProfileService (deriva LearningState -- v1.7.0, sin cambios)
    ↓
TutorLearningContext (v1.8.0 Bloque 1)
    ↓
TutorTeachingPolicy (v1.8.0 Bloque 3, determinística)
    ↓
TutorInteractionPolicy (v1.8.0 Bloque 4, determinística)
    ↓
Tutor (tutor-v7) -- explicación grounded + micro-check formativo opcional
    ↓ (si el alumno responde)
microcheck-feedback-v1 -- feedback formativo grounded
```

Cada flecha hacia abajo es una transformación 100% determinística
(sin LLM) hasta llegar al Tutor mismo. El LLM entra recién en el
penúltimo y último paso, y solo para EXPRESAR una estrategia/evaluar una
respuesta puntual — nunca para decidir el estado de aprendizaje.

## Pedagogical Guarantees

- **El micro-check es exclusivamente formativo.** Nunca es
  Certification, nunca es un Checkpoint de la clase generada, nunca se
  persiste.
- **Una respuesta correcta a un micro-check NUNCA otorga `mastered`.**
- **Una respuesta incorrecta a un micro-check NUNCA crea `needs_review`.**
- **La conversación del Tutor no es evidencia de Certification.** Nunca
  contribuye a `topic_progress`, `certification_attempts` ni
  `certification_topic_results`.
- **`LearningState` sigue siendo 100% determinístico y derivado** —
  exactamente igual que en v1.7.0: nunca se persiste, nunca lo calcula
  un LLM, se recalcula desde cero en cada request a partir de evidencia
  real.

Probado en vivo (Postgres + proveedor LLM real): 10 micro-checks
`correct` consecutivos y 10 `needs_revision` consecutivos, cada uno
seguido de una comparación byte-a-byte del `LearningProfile` antes/después
— sin ninguna diferencia en ningún caso.

## Compatibility / Upgrade

- **Sin migración de base de datos desde v1.7.0.** Alembic permanece en
  `0003` (single head): `app_users`, `user_identities`, `topic_progress`,
  `certification_attempts`, `certification_topic_results`. Adaptive
  Tutor no agrega ninguna tabla nueva (`TutorLearningContext`/
  `TutorTeachingPolicy`/`TutorInteractionPolicy`/`TutorMicroCheck`/
  feedback formativo: todos se derivan por request, ninguno se
  persiste).
- Los perfiles server-side existentes (v1.7.0) siguen funcionando
  exactamente igual — el Tutor simplemente empieza a leerlos.
- No se reintrodujo ningún store de aprendizaje local en el frontend:
  `localStorage` sigue siendo exclusivamente compatibilidad de
  migración legacy (v1.6.x), `sessionStorage` sigue siendo exclusivamente
  el flujo transitorio de Guided Review/Verification ya existente. La
  interacción del micro-check en el frontend vive en memoria de React
  (`useState`), nunca en almacenamiento persistente del navegador.
- Los cursos siguen viviendo en el filesystem (Markdown), sin cambios.

## Auth

Microsoft Entra SSO **NO está implementado todavía**. El modo de
autenticación de desarrollo actual sigue siendo `AUTH_MODE=dev` (header
`X-Dev-User` opcional). La arquitectura de identidad (`IdentityProvider`/
`AppUser`/`UserIdentity`, desde v1.7.0) permanece intacta y preparada
para una futura integración con Entra — seleccionar `AUTH_MODE=entra`
hoy produce un error de configuración explícito, nunca un fallback
silencioso ni una implementación falsa.

## Known Limitations

- La EXPRESIÓN final de `TutorTeachingPolicy` por parte del LLM no está
  garantizada matemáticamente: el modelo/proveedor actual puede hacer
  que algunas diferencias adaptativas sean sutiles en preguntas muy
  simples o de comparación directa (documentado con ejemplos reales en
  `docs/ADAPTIVE_TUTOR_V1_8.md`).
- Los micro-checks son efímeros: desaparecen al refrescar la página
  (igual que el resto de la conversación del Tutor, comportamiento
  existente desde Fase 5).
- Los micro-checks no se leen en voz alta automáticamente todavía
  (decisión deliberada, para no arriesgar un segundo dueño de voz
  simultáneo).
- El feedback formativo no se persiste en ningún lado.
- La conversación del Tutor no es evidencia permanente de aprendizaje.
- Microsoft Entra SSO no está implementado (ver sección Auth).
- Los cursos siguen basados en filesystem (sin cambios respecto a
  versiones anteriores).
- Sin automatización de backup de la base de datos (si esto seguía
  siendo cierto en v1.7.0, sigue siéndolo acá — no se tocó nada de
  infraestructura de persistencia en este release).

## Version Notes

- `APP_VERSION`: `1.7.0` → `1.8.0`.
- `LESSON_PROMPT_VERSION`: sin cambios (`lesson-v3.3.1`).
- `CERTIFICATION_PROMPT_VERSION`: sin cambios (`certification-v2`).
- `TUTOR_PROMPT_VERSION`: `tutor-v4` → `tutor-v7` a lo largo de los
  bloques de este release (`tutor-v5` Bloque 2, `tutor-v6` Bloque 3,
  `tutor-v7` Bloque 4 — el Tutor nunca cachea respuestas, así que estos
  bumps no invalidan ninguna cache, existen solo para trazabilidad).
- `MICROCHECK_FEEDBACK_PROMPT_VERSION`: nuevo, `microcheck-feedback-v1`.

Nota local (no forma parte del release): el `.env` de desarrollo local
de esta máquina (gitignored, nunca versionado) puede seguir declarando
`APP_VERSION=1.6.1` de una sesión anterior — un entorno limpio/controlado
(sin ese `.env` local) reporta correctamente `1.8.0`, confirmado durante
la preparación de este RC.
