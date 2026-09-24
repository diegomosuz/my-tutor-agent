---
title: Ejemplos de código
order: 2
description: Fenced code blocks en distintos lenguajes — fixture visual de Rich Markdown Rendering.
---

# Ejemplos de código

Fixture visual para verificar que los bloques de código se muestran con
fondo distinguible, fuente monoespaciada, indentación preservada y
scroll horizontal cuando una línea es muy larga — sin que eso desborde
el resto del aula virtual.

## Python

Un cliente mínimo que llama a un modelo:

```python
from openai import OpenAI

client = OpenAI()

def preguntar(mensaje: str) -> str:
    respuesta = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": mensaje}],
    )
    return respuesta.choices[0].message.content
```

## JSON

Un objeto de configuración típico:

```json
{
  "provider": "openai",
  "model": "gpt-4o-mini",
  "temperature": 0.2,
  "max_tokens": 512
}
```

## Bash

Comandos para levantar un entorno local:

```bash
docker compose up -d --build
docker compose logs -f backend
```

## Línea larga (prueba de scroll horizontal)

```python
resultado = cliente.generar(prompt="Explicá en detalle la diferencia entre un agente reactivo y un agente basado en objetivos, con al menos tres ejemplos concretos de cada uno")
```

## Código sin lenguaje declarado

```
Este bloque no declara lenguaje: debe seguir mostrándose como código
verbatim, sin etiqueta de lenguaje.
```
