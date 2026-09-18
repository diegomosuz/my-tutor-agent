# Formato del filesystem de cursos

Este documento describe cómo estructurar un directorio de cursos para que
PwC AI Tutor lo pueda leer. El backend **solo lee** ese directorio (se
monta `read_only: true` en Docker); nunca lo modifica.

## Estructura de directorios

```
<COURSES_HOST_PATH>/
    <curso>/                        # directorio de primer nivel = curso
        <modulo>/                   # directorio dentro del curso = módulo
            <topico>.md              # archivo .md dentro del módulo = tópico
            images/
                <imagen>.png
```

- Un **curso** es cualquier subdirectorio de primer nivel dentro de
  `COURSES_HOST_PATH`.
- Un **módulo** es cualquier subdirectorio dentro de un curso.
- Un **tópico** es cualquier archivo `.md` dentro de un módulo.
- Directorios/archivos ocultos o de sistema (`.DS_Store`, `Thumbs.db`,
  `desktop.ini`, `__MACOSX`, `node_modules`, cualquier nombre que empiece
  con `.`) se ignoran automáticamente y nunca se tratan como curso, módulo
  o tópico.
- Archivos que no sean `.md` dentro de un módulo (aparte de imágenes
  referenciadas, ver abajo) se ignoran para efectos de listar tópicos.

## Orden y nombres

- Los directorios/archivos pueden tener un prefijo numérico para definir
  orden explícito, por ejemplo `01-fundamentos`, `02-arquitecturas`. El
  prefijo se usa únicamente para ordenar y se quita al mostrar el título.
- Guiones (`-`) y guiones bajos (`_`) se convierten en espacios al mostrar
  el título (`patrones-tecnicos` → "Patrones tecnicos"), salvo que el
  título venga definido explícitamente en el frontmatter.
- El `id` usado en las URLs de la API es un slug derivado del nombre de
  archivo/directorio (sin el prefijo numérico, en minúsculas). Nunca se
  construye una ruta de filesystem directamente a partir de ese `id`: el
  backend siempre enumera las entradas reales del directorio y compara sus
  slugs contra el `id` recibido, lo que impide path traversal por diseño.

## Frontmatter opcional

Cada tópico puede empezar (opcionalmente) con YAML frontmatter:

```markdown
---
title: Arquitectura de IA
order: 1
description: Introducción a los patrones de arquitectura de soluciones de IA.
---

# Contenido del tópico...
```

Si no hay frontmatter, el título y el orden se infieren del nombre de
archivo (ver sección anterior). El sistema es siempre tolerante a la
ausencia de frontmatter — no es obligatorio.

## Codificación

Todos los archivos `.md` deben estar en **UTF-8**. Un archivo con
codificación inválida se reporta como advertencia/error en el diagnóstico
de cursos (`GET /api/system/course-diagnostics`) para ese tópico
específico, sin afectar al resto del curso ni del catálogo.

## Imágenes relativas

Un tópico puede referenciar imágenes ubicadas dentro del mismo curso con
una ruta relativa:

```markdown
![Arquitectura de referencia](images/architecture.png)
```

- La ruta es relativa al directorio del **módulo** donde vive el `.md`
  que la referencia (por eso el ejemplo de más arriba pone `images/` como
  subdirectorio del propio módulo), y se resuelve de forma segura en el
  backend a través de un endpoint contextual (nunca se acepta una ruta de
  filesystem arbitraria desde el navegador).
- Formatos soportados: **`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`**.
- **No soportado todavía**: `.svg` (puede contener contenido activo) y
  cualquier tipo no-raster. Tampoco se sirven `.html`, `.js`, `.exe`,
  `.ps1`, `.bat`, `.cmd` ni ningún tipo ejecutable, sin importar qué
  extensión tenga el archivo referenciado.
- Imágenes externas (`http://` / `https://`) **no se cargan
  automáticamente** en esta fase — se muestra un enlace/placeholder en su
  lugar, para que la aplicación pueda funcionar offline salvo por las
  llamadas a LLM/voz.
- Una imagen referenciada que no existe en el filesystem se reporta en el
  diagnóstico de cursos como advertencia (`missing relative asset`), sin
  romper la carga del tópico.

## Links

Los links `http://`/`https://`/`mailto:` dentro del Markdown se muestran
normalmente y abren en una pestaña nueva (`target="_blank" rel="noopener
noreferrer"`). Esquemas potencialmente peligrosos (`javascript:`, `data:`,
`file:`) nunca se renderizan como link activo.

## HTML crudo

El Markdown de un tópico se renderiza siempre como Markdown — **nunca**
se interpreta HTML crudo embebido en el archivo (no hay
`dangerouslySetInnerHTML` en ningún componente del aula). Si necesitás una
tabla, código, cita o imagen, usá la sintaxis Markdown estándar.

## Ejemplo mínimo

```
mis-cursos/
    curso-demo/
        01-fundamentos/
            01-introduccion.md
            images/
                diagrama.png
        02-arquitecturas/
            01-patrones-tecnicos.md
```

`01-introduccion.md`:

```markdown
---
title: Introducción
order: 1
---

# Introducción

Este curso cubre los fundamentos de arquitectura de soluciones de IA.

![Diagrama de referencia](images/diagrama.png)

Más información: [documentación oficial](https://example.com/docs)
```
