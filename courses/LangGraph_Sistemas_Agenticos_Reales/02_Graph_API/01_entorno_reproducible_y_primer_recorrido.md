---
id: "m02_t01"
title: "Entorno reproducible y primer recorrido"
module: "Graph API"
module_order: 2
topic_order: 1
duration_minutes: 15
level: "intermedio-avanzado"
language: "es"
prerequisites: "Módulo 1; Python instalado."
objectives: ["Preparar el entorno local y verificar versiones.", "Ejecutar el primer grafo sin credenciales de un proveedor."]
---

# 2.1. Entorno reproducible y primer recorrido

**Módulo 2: Graph API · Dedicación estimada: 15 minutos**

## Qué vas a poder hacer

- Preparar el entorno local y verificar versiones.
- Ejecutar el primer grafo sin credenciales de un proveedor.

**Antes de empezar:** Módulo 1; Python instalado.

## Preparación

Usá Python 3.11 o 3.12, una terminal y un editor como VS Code. Descomprimí el curso en una ruta de trabajo corta y abrí la carpeta **_laboratorio**. Los ejercicios determinísticos, el agente simulado y el proyecto final funcionan sin una API de modelos. Las variantes con proveedor están identificadas como opcionales.

El entorno principal del curso fija estas dependencias:

```text
langgraph==1.2.11
langchain-core==1.6.3
langchain-openai==1.6.2
langgraph-checkpoint-sqlite==3.1.1
langchain==1.4.2
pydantic==2.13.5
```

El archivo requirements.txt está en el laboratorio. El archivo requirements-lock.txt registra además las dependencias transitivas del entorno de verificación; consultá VALIDACION.md para conocer el intérprete utilizado. No se presenta esa combinación como «la última versión»: es una base concreta para reproducir el curso.

## Instalación en Windows con PowerShell

Ejecutá desde _laboratorio:

```powershell
py -3.11 -m venv .venv
$cursoPython = ".\.venv\Scripts\python.exe"
& $cursoPython -m pip install -r requirements.txt
& $cursoPython triage.py
```

La primera línea crea un entorno aislado. La variable cursoPython apunta al intérprete de ese entorno. La tercera instala los paquetes en el intérprete correcto. La cuarta ejecuta el ejemplo. No hace falta activar scripts de PowerShell ni cambiar la política de ejecución. Si trabajás con Python 3.12, cambiá únicamente el selector de la primera línea.

En macOS o Linux creá el entorno con python3 -m venv .venv y usá .venv/bin/python para instalar paquetes y ejecutar archivos. Los scripts Python son los mismos. En VS Code seleccioná ese intérprete para que el editor y la terminal no utilicen entornos diferentes.

## Resultado esperado

```text
high
Derivar al equipo de incidentes.
```

Todavía no hay un modelo de lenguaje. La regla busca la palabra «caído» y elige una ruta. Esta separación permite diagnosticar errores del grafo sin mezclarlos con variabilidad del proveedor.

## Dos formatos que no deben mezclarse

Los ejemplos de Graph API usan invoke con version="v2" y leen result.value. Una interrupción se consulta mediante result.interrupts. El streaming v2 usa diccionarios con type, ns y data. El string v2 es una versión del formato de respuesta, no la versión instalada del paquete.

La variante de create_agent del módulo 3 utiliza invoke sin ese argumento y lee un diccionario. Functional API devuelve el valor de la función. Cada tópico explicita su contrato; copiar solo la línea que accede al resultado de otro ejemplo puede fallar.

## Diagnóstico inicial

| Síntoma | Comprobación útil |
| --- | --- |
| ModuleNotFoundError | ¿pip y el script usan el mismo intérprete? |
| No existe py -3.11 | Instalá Python o seleccioná 3.12 si ya está disponible |
| No existe triage.py | Verificá que estás dentro de _laboratorio |
| Falta MODEL_NAME | Estás ejecutando una variante con proveedor |
| Atributo value inexistente | Revisá la versión instalada y el contrato de invoke |

## Comprobación de comprensión

**Antes de mirar la respuesta:** ¿Por qué instalar con el ejecutable del entorno seguido de -m pip?

### Respuesta razonada

Así la instalación queda ligada al mismo intérprete que ejecutará el programa. Usar un pip encontrado por el PATH puede instalar en otra versión de Python y producir errores difíciles de interpretar.

## Documentación para profundizar

- [Descripción de LangGraph](https://docs.langchain.com/oss/python/langgraph/overview)
- [Quickstart](https://docs.langchain.com/oss/python/langgraph/quickstart)

---

[Índice del módulo](00_inicio_del_modulo.md) · [Índice del curso](../README.md) · [Anterior](../01_Fundamentos/06_practica_justificar_una_arquitectura_simple.md) · [Siguiente](../02_Graph_API/02_contrato_del_estado_y_diseno_de_nodos.md)
