# Release Notes — v1.0.1

Release correctiva sobre v1.0.0. Sin features nuevas, sin cambios de
arquitectura. Corrige un bug real (reproducido con un curso real,
multi-módulo, en producción local) donde preparar una práctica de
certificación de "Curso completo" con pocas preguntas pedidas podía
tardar varios minutos y terminar fallando con un `502` engañoso, y un
falso diagnóstico de curso `error` en `doctor.ps1` para un curso
completamente funcional.

## Bug real corregido: preparación de certificación en cursos grandes

**Causa raíz** (confirmada por inspección de código, no solo por el
reporte): `OpenAIProvider.generate_structured` envolvía toda la llamada al
SDK en un único `except Exception` defensivo que reclasificaba **cualquier**
excepción no reconocida como `LLMUpstreamError` — incluyendo fallos de
parseo/validación del structured output que ocurren *después* de una
respuesta HTTP 200 exitosa. Combinado con que `prepare_exam` generaba un
`QuestionBank` para **todos** los tópicos del scope antes de ensamblar el
examen (sin importar cuántas preguntas se hubieran pedido), un solo tópico
con una salida inválida abortaba toda la preparación con un `502 Bad
Gateway` — incluso cuando ya había decenas de preguntas válidas
disponibles y el proveedor había respondido `200 OK` en cada llamada.

### Incremental certification preparation

`prepare_exam` ya no genera bancos para todo el scope. Ordena los
candidatos (round-robin determinístico por módulo — nunca `random`, nunca
LLM) y los procesa incrementalmente, cache-first, deteniéndose en cuanto
hay cobertura y cantidad suficientes.

### Early stopping

En cuanto se cubren `min(requested_count, tópicos disponibles)` tópicos
distintos **y** hay `requested_count` preguntas disponibles, se detiene —
el resto de los candidatos del scope ni se tocan (`certification_early_stop`
+ `certification_bank_generation_skipped` en los logs).

### Per-topic fault tolerance

Un tópico que falla (error transitorio de proveedor, o contrato/grounding
inválido tras agotar sus reintentos) se salta y la preparación continúa
con el siguiente candidato — nunca aborta toda la práctica mientras el
resto del scope pueda cubrir el pedido. Solo un error sistémico
(credencial rechazada o mal configurada) corta la búsqueda de inmediato.

### Improved LLM error classification

`LLMUpstreamError` queda reservado exclusivamente para cuando la llamada
de red en sí falló (timeout/conexión/5xx). Un HTTP 200 que después no
cumple el contrato (JSON inválido, `finish_reason=length`, content filter,
o cualquier excepción no reconocida del SDK durante el parseo local) se
clasifica correctamente como `LLMResponseError` — nunca como un falso
error de proveedor.

`POST .../certification/prepare` ahora distingue con precisión:
- Al menos una pregunta válida disponible → `200 OK` (aunque sea menos que
  lo pedido — un curso/scope corto puede legítimamente no alcanzar).
- Ningún tópico produjo contenido válido pero el proveedor sí respondió →
  `422` con un mensaje específico y seguro (nunca un `502` engañoso).
- El proveedor realmente inaccesible (nunca llegó a responder) → se
  conserva el `502`/`503` real.

### Course diagnostics fix

`duplicate_slug` (dos archivos/directorios que colisionan en el mismo slug
tras quitar el prefijo numérico) bajó de severidad `error` a `warning`: la
resolución determinística por slug siempre toma el primer match, así que
el curso sigue funcionando de punta a punta — el segundo archivo queda
"sombreado", el mismo tipo de situación que un asset no soportado.
`error` queda reservado exclusivamente para tópicos que literalmente no
pueden leerse (UTF-8/frontmatter inválido). `scripts/doctor.ps1` ya no
muestra el contradictorio `[OK] ... diagnostico: error`: ahora usa
`[OK]`/`[WARN]`/`[FAIL]` según el estado real.

## Sin cambios de arquitectura

- Mismo stack: FastAPI + React/TypeScript + Docker Compose.
- Sin base de datos, sin Redis, sin RAG, sin embeddings, sin
  microservicios.
- Markdown → `CanonicalTopicContent` → Grounding Packet sigue siendo la
  única fuente de verdad pedagógica; el LLM sigue sin poder agregar
  conocimiento externo.
- El answer key de certificación sigue siendo exclusivamente server-side
  antes de evaluar.
- PwC GenAI y OpenAI siguen soportados y desacoplados de la voz.
- Windows + Docker Desktop sigue siendo el único requisito de host.
- Las cache keys existentes (`course/module/topic/content_sha256/
  provider/model/prompt_version[/items_per_topic]`) no cambiaron: las
  caches de v1.0.0 se siguen reutilizando sin invalidación.

## Compatibilidad hacia atrás

- El contrato de `POST .../certification/prepare` es el mismo
  (`CertificationPrepareResponse` sin cambios de forma); el único cambio
  observable es que ya nunca devuelve `200` con `actual_count: 0` — ese
  caso ahora es un `422` explícito con mensaje claro.
- Ningún otro endpoint, modelo ni contrato cambió.
