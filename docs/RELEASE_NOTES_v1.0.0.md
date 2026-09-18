# Release Notes — v1.0.0

Primer release candidate estable de **PwC AI Tutor**: un aula virtual
inteligente local, dockerizada, donde el Markdown de cada tópico es la
única fuente de verdad pedagógica.

## Qué incluye v1.0

- **Catálogo y navegación**: cursos → módulos → tópicos, leídos desde un
  filesystem de cursos montado read-only. Detalle de curso, breadcrumb,
  404 y `ErrorBoundary` en toda la navegación.
- **Modelo canónico determinístico**: cada tópico se segmenta en
  `SourceBlock` (`SRC-001`, ...) con hash de contenido estable; el
  Grounding Packet resultante es el único contexto pedagógico que recibe
  un LLM.
- **Generación de clases con IA** (`LessonPlan` grounded): estructura de
  escenas, key points, narración, visuals declarativos (nunca HTML/JS
  ejecutable) — todo trazable a `SRC-XXX` reales.
- **Aula virtual interactiva**: Classroom Engine + 11 tipos de slide,
  controles Previo/Siguiente/Pausa/Repetir/Voz/Salir, progreso local en
  `localStorage`.
- **Tutor conversacional grounded**: preguntas y respuestas sobre el
  tópico activo, con interrupción/reanudación real de la clase.
Checkpoints interactivos evaluados contra el material autorizado.
- **Práctica de certificación grounded**: preguntas objetivas
  (single/multiple choice) generadas por tópico, ensamblaje y evaluación
  100% determinísticos (sin LLM). Nunca representa ni afirma reproducir
  un examen oficial de ninguna certificación externa.
- **Voz**: Web Speech API del navegador siempre disponible; voz neural
  OpenAI opcional (`VOICE_PROVIDER=auto|browser|openai`), con fallback
  automático a la voz del navegador ante cualquier error.
- **Assets de curso**: imágenes relativas (`.png/.jpg/.jpeg/.webp/.gif`)
  servidas de forma segura, con path traversal y symlink escape
  estructuralmente bloqueados.
- **Diagnóstico y configuración**: `GET /api/system/status` y
  `GET /api/system/course-diagnostics` (sin secretos), pantalla de
  Configuración en el frontend.
- **Scripts de Windows**: `setup.ps1`/`start.ps1`/`stop.ps1`/`doctor.ps1`
  — instalación y arranque sin requerir Python/Node en el host.

## Requisitos

- Docker Desktop. Nada más es estrictamente necesario en el host.
- Opcional: credencial de PwC GenAI Shared Service u OpenAI (LLM).
- Opcional: credencial de OpenAI (voz neural).
- La aplicación funciona por completo sin ninguna credencial (catálogo,
  cursos, tópicos, voz del navegador); la IA y la voz neural quedan
  simplemente no disponibles con un `503`/mensaje claro.

## Capabilities

- Funciona 100% local y offline salvo por las llamadas explícitas a un
  proveedor LLM/TTS configurado.
- Soporta cualquier directorio de cursos externo al repositorio
  (`COURSES_HOST_PATH`), validado con un curso real fuera del repo
  (Markdown + imágenes + tabla + código + link).
- Cache en filesystem para lecciones, bancos de preguntas y audio —
  descartable en cualquier momento sin romper la app.

## Limitaciones conocidas (deliberadas, ver `docs/ROADMAP.md`)

- Sin persistencia de resultados de certificación ni historial de
  intentos (vive en `sessionStorage` de la sesión del navegador).
- Sin pantalla "Mi aprendizaje" funcional todavía (placeholder).
- Sin diagramas tipo Mermaid ni animaciones de mayor producción.
- Sin RAG, embeddings, base de datos vectorial, ni base de datos alguna.
- Sin autenticación/SSO/multiusuario.
- Sin CSP (decisión documentada: rompería el dev server de Vite sin
  beneficio real en un contexto 100% local).

## Modelo de seguridad (resumen)

- Las credenciales de proveedores LLM/voz nunca salen del backend; nunca
  llegan al navegador, nunca se loguean.
- `.env` es un secreto local en texto plano, gitignored, nunca compartido.
- El filesystem de cursos se monta read-only; toda resolución de
  curso/módulo/tópico/asset pasa por un repositorio seguro que nunca
  concatena input del cliente en una ruta de filesystem, y que excluye
  symlinks que intenten escapar del árbol autorizado.
- La respuesta de certificación previa a responder nunca incluye el
  answer key; el frontend nunca ejecuta salida del LLM (sin
  `dangerouslySetInnerHTML`/`eval`/`new Function`, sin HTML crudo).
- Ver `docs/ARCHITECTURE.md` sección "Modelo de seguridad local" para el
  detalle completo.

## Formato de curso soportado

Ver `docs/COURSE_FORMAT.md`. En resumen: `curso/módulo/tópico.md`,
frontmatter YAML opcional, imágenes relativas al módulo
(`.png/.jpg/.jpeg/.webp/.gif`), UTF-8, links `http(s)`/`mailto`, sin HTML
crudo interpretado.

## Stack técnico

React + TypeScript + Vite (frontend) · Python 3.11 + FastAPI + Pydantic
(backend) · Docker + Docker Compose · sin base de datos.
