# Release Checklist

Checklist reproducible para preparar cualquier release futuro de
PwC AI Tutor. Basado en el proceso real seguido para v1.0.0.

## Git

- [ ] `git status` — working tree limpio antes de empezar.
- [ ] `git log --oneline -10` — HEAD es el commit esperado.
- [ ] `git diff` / `git diff --cached` antes de cada commit — revisar
      contenido real, no solo nombres de archivo.
- [ ] Sin `.env`, API keys, caches (`data/*-cache/*`, solo `.gitkeep`),
      audio generado, capturas de QA, cursos externos temporales,
      `node_modules`, `dist`, artefactos de coverage.

## Tests

- [ ] Backend: `docker compose run --rm backend pytest` — 100% verde.
- [ ] Frontend: `docker compose run --rm frontend npm test -- --run` —
      100% verde.
- [ ] Frontend typecheck: `npx tsc --noEmit` sin errores.
- [ ] Ningún test se borró para "hacer pasar" un cambio; si una
      expectativa cambió legítimamente, está documentado por qué.

## Build

- [ ] `docker compose run --rm frontend npm run build` exitoso.
- [ ] `docker compose config` válido.
- [ ] `docker compose build` (con cache) exitoso.
- [ ] `docker compose build --no-cache` exitoso en un proyecto Compose
      aislado (nombre de proyecto distinto, sin tocar el stack de
      desarrollo activo).

## Seguridad

- [ ] Grep de `dangerouslySetInnerHTML`/`eval(`/`new Function`/
      `innerHTML =`/`document.write`/`<iframe`/`srcdoc` en `frontend/src`
      — solo comentarios, cero usos reales.
- [ ] Grep de `OPENAI_API_KEY`/`PWC_GENAI_API_KEY`/`GEN_AI_API_KEY`/
      `sk-`/`Bearer ` en `frontend/src` — cero secretos reales.
- [ ] `git log -p --all` — sin secretos reales en ningún commit histórico.
- [ ] Traversal de assets (`../`, absoluto, encoded) y symlink escape
      (curso/módulo/tópico/asset symlinkeado fuera de `/content`) — 404
      en todos los casos.
- [ ] `ExamQuestionView`/tipos TS de certificación — sin
      `correct_option_ids`/`explanation`/`derivation_refs` antes de
      responder.
- [ ] Logging — sin API keys, Authorization, prompts completos, Grounding
      Packet completo, historial de conversación completo, respuestas
      crudas del LLM.

## Secrets / .env

- [ ] `.env.example` vs `Settings` (config.py) vs `docker-compose.yml`
      vs `docs/CONFIGURATION.md` — sin variables huérfanas en ningún
      sentido (documentada-no-usada, usada-no-documentada,
      presente-en-Settings-no-en-compose, default stale).

## Cursos

- [ ] Curso de demo incluido carga correctamente.
- [ ] Curso externo real (fuera del repo, con Markdown + imagen + link +
      código + tabla) carga correctamente vía `COURSES_HOST_PATH`.
- [ ] Diagnóstico de cursos (`/api/system/course-diagnostics`) aísla
      errores por curso sin romper el catálogo.

## LLM

- [ ] `LLM_PROVIDER=pwc` sin credencial → `configured: false`, `503` claro.
- [ ] `LLM_PROVIDER=openai` sin credencial → ídem.
- [ ] Con credencial real (si disponible): una generación real + una
      cache-hit confirmada.
- [ ] `LLM_PROVIDER` y `VOICE_PROVIDER` decoupled: probar al menos una
      combinación cruzada real (ej. `pwc` + voz `openai`).

## Voz

- [ ] Voz del navegador funciona sin ninguna credencial.
- [ ] Voz neural (si hay `OPENAI_API_KEY`): una síntesis real + cache-hit
      con bytes idénticos.
- [ ] Fallback a voz del navegador ante error de voz neural, sin romper
      la clase.

## Certificación

- [ ] Evaluación determinística (single/multiple/sin responder/parcial)
      — sin LLM en la ruta de evaluación.
- [ ] Ningún string de UI insinúa aprobación oficial de una certificación
      externa.
- [ ] `actual_count: 0` (scope sin material suficiente) no rompe la UI.

## Responsive / QA visual

- [ ] 5 resoluciones (1920/1440/1024/768/400) × pantallas principales
      (Catálogo, Curso, Aula, Tutor activo, Certificación setup/práctica/
      simulacro/resultados, Configuración, 404) — sin overflow horizontal,
      sin errores de consola.

## Docs

- [ ] README actualizado (Quick Start Windows arriba de todo).
- [ ] `docs/COURSE_FORMAT.md`, `docs/CONFIGURATION.md` reflejan la
      realidad del código.
- [ ] `docs/PRODUCT_AUDIT.md` actualizado si el estado de algún subsistema
      cambió.
- [ ] `docs/RELEASE_NOTES_v{version}.md` nuevo, con capabilities/
      limitations/security model reales de esa versión.

## Instalación limpia

- [ ] Proyecto Compose aislado, `build --no-cache`, `up -d`, sin ninguna
      credencial — confirmar backend/frontend/`/ready`/catálogo/estado
      IA-no-configurada, luego destruir el proyecto aislado sin tocar el
      stack de desarrollo real.

## Versión

- [ ] `APP_VERSION` actualizado en `backend/app/config.py`,
      `.env.example`, `docker-compose.yml` (default), y
      `docs/CONFIGURATION.md` — todos coherentes entre sí.
- [ ] Versión de prompts (`LESSON_PROMPT_VERSION`, etc.) NO se cambia solo
      por el release — solo cuando el prompt en sí cambió.

## Commit y tag

- [ ] Commit final con mensaje descriptivo (`chore: prepare vX.Y.Z
      release candidate` o similar).
- [ ] El tag `vX.Y.Z` se crea SOLO después de revisión humana explícita
      del informe de release — nunca automáticamente en la misma sesión
      que preparó el candidate.
