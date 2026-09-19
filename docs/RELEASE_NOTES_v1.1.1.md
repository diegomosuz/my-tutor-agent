# Release Notes — v1.1.1

Release correctiva de UX sobre v1.1.0. Sin cambios de backend, sin cambios
de API, sin cambios de arquitectura. Reorganiza la distribución visual del
aula virtual (Classroom) — los controles de reproducción y el tutor no
cambian de comportamiento, solo de posición en la página.

## Problema de UX corregido

Los controles de la escena (Previo, Pausar/Reanudar, Repetir, Activar voz,
Siguiente) y "Salir de la clase" vivían todos juntos en una única barra al
final de toda la página — por debajo del contenido completo del tema, del
panel de grounding (desarrollo) y del panel del tutor. Visualmente
quedaban desconectados de la diapositiva que en realidad controlan.

## Reorganización del Classroom

- **Toolbar de escena** (Previo / Pausar·Repetir·Voz + indicador "Escena X
  de Y" / Siguiente) ahora vive inmediatamente debajo de la diapositiva y
  su narración, dentro de la misma columna izquierda — comparte
  exactamente su ancho, nunca se extiende bajo el panel derecho de
  contenido. Tres zonas: Previo (secundario) a la izquierda, Pausar/
  Repetir/Voz (neutrales) + indicador de escena al centro, Siguiente
  (botón primario PwC) a la derecha.
- **"Salir de la clase"** se movió al header de contexto del aula (arriba
  a la derecha, junto al selector de módulo), como una acción de
  navegación de nivel superior — ya no comparte la barra con los
  controles de reproducción. Estilo neutral, no el rojo de acciones
  destructivas (ese rojo sigue reservado para "Restablecer progreso" en
  Configuración).
- **Secuencia visual**: diapositiva → controles de escena → "Preguntá al
  tutor" (el panel del tutor se movió a la misma columna, justo debajo del
  toolbar). El contenido completo del tema sigue visible en paralelo, en
  el panel derecho, sin cambios.
- El indicador "Escena X de Y" se movió desde dentro de la diapositiva
  hacia el centro del nuevo toolbar; "↻ Regenerar clase con IA" queda
  como link secundario dentro de la diapositiva.
- Checkpoint/Reflexión mantienen exactamente su posición anterior
  (inmediatamente después de la narración, antes del toolbar) — ya
  funcionaba bien asociado a la escena activa, no se tocó.

## Responsive

- Desktop (1920×1080 / 1366×768): tres zonas en una fila, ancho del
  toolbar idéntico al de la diapositiva.
- Tablet apaisada (1024×768): igual que desktop, layout de dos columnas.
- Tablet vertical (768×1024): una columna (el mismo breakpoint de 960px
  que ya existía), toolbar sigue en una sola fila.
- Mobile (~390×844): el toolbar pasa a dos filas — Previo/Siguiente
  arriba (los más fáciles de localizar), Pausar/Repetir/Voz + indicador
  abajo. Sin overflow horizontal en ningún ancho probado.

## Bug real encontrado y corregido durante el QA de este bloque

No relacionado con el layout: `ClassroomPage` tenía un `return` condicional
(el estado de error "tópico no encontrado") ubicado *antes* de un
`useMemo` en el cuerpo del componente — una violación de las reglas de
hooks de React ya presente en v1.1.0 (confirmado idéntico contra
`master`). Navegar a un tópico inexistente sin desmontar la página (por
ejemplo, una URL editada a mano) disparaba "Rendered fewer hooks than
expected" y tiraba abajo toda la pantalla hacia el `ErrorBoundary`
genérico, en vez de mostrar el mensaje de error normal ("Este tópico no
existe..."). Corregido moviendo el `return` de error a después de todos
los hooks del componente — cero cambio de comportamiento en el camino
feliz, confirmado con una reproducción real en navegador antes y después
del fix, y con un test de regresión nuevo.

## Sin cambios de backend/API

- Ningún endpoint, modelo Pydantic ni contrato HTTP cambió.
- `ClassroomEngine`, `LessonGenerator`, `TutorService`, `SpeechService`,
  Learning Progress, Adaptive Learning, Certification y el pipeline de
  grounding no se tocaron.
- Cache keys sin cambios: las caches de `LessonPlan`/`QuestionBank`/voz de
  v1.1.0 se siguen reutilizando sin invalidación.

## Validación

- 389 tests de backend (sin cambios, cero archivos de backend tocados) y
  330 de frontend (+15 nuevos: 14 del nuevo layout del Classroom + 1 de
  regresión del bug de hooks) — sin fallas.
- Build de producción del frontend limpio (`tsc && vite build`).
- `docker compose build --no-cache` limpio; ambos containers healthy;
  `scripts/doctor.ps1` en verde (mismo `[WARN]` benigno preexistente de
  `duplicate_slug`).
- QA visual real sobre `claude-foundations-certification` (lesson-v3, ya
  cacheada) en 1920×1080, 1366×768, 1024×768, 768×1024 y 390×844: ancho
  del toolbar idéntico al de la diapositiva en cada resolución, sin
  overflow horizontal, sin superposición entre columnas, "Salir de la
  clase" siempre visible en el header. QA funcional real en navegador:
  Previo/Siguiente/Pausar-Reanudar/Repetir/Voz/Tutor probados de punta a
  punta, cero errores de consola.

## APP_VERSION

`1.1.0` → `1.1.1` (`backend/app/config.py`, `docker-compose.yml`,
`.env.example`).

## Estado del release

Cambios en la rama `fix/v1.1.1-classroom-navigation-ux`, creada desde
`master` (`63feb5a...`, v1.1.0 publicada). Sin push, sin tag, sin merge a
`master` — decisión de release separada.
