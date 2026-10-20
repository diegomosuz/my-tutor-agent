# Extraer el código Python del laboratorio de API ML

El curso se entrega íntegramente como archivos Markdown. El capítulo 18 contiene los tres archivos Python en **bloques de código completos**, por lo que no hace falta redistribuir fuentes separadas en el ZIP.

## Opción 1: copiar los tres bloques

1. Abrir [`18-laboratorio-integrador-api-ml.md`](../complementarios/18-laboratorio-integrador-api-ml.md).
2. Crear una carpeta vacía `api_ml_formal/`.
3. Copiar el bloque `D.1` en `model_service.py`, `D.2` en `app.py` y `D.3` en `test_app.py`.
4. Instalar dependencias y ejecutar los comandos del apartado E.

## Opción 2: extracción semiautomática

Guardar este código como `extraer.py` en la raíz de `Curso_Derivacion_Kaldewaij/` y ejecutarlo con `python extraer.py`:

```python
from pathlib import Path
import re

source = Path('complementarios/18-laboratorio-integrador-api-ml.md')
text = source.read_text(encoding='utf-8')
chunks = re.findall(r'### D\.[123].*?\n\n```python\n(.*?)\n```', text, re.S)
if len(chunks) != 3:
    raise RuntimeError('La estructura del laboratorio cambió')

out = Path('api_ml_formal')
out.mkdir(exist_ok=True)
for name, code in zip(('model_service.py','app.py','test_app.py'), chunks):
    (out / name).write_text(code + '\n', encoding='utf-8')
    print('Creado:', out / name)
```

Esta utilidad solo copia el código del texto local del curso y no realiza ninguna operación de red. Los comandos `uvicorn`/`pytest` están documentados en el capítulo 18.
