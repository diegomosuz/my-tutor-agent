# 18 · Laboratorio integral: derivación de una API de inferencia ML

**Módulo complementario.** **Carga:** 8 h. Caso totalmente original que aplica las reglas de Kaldewaij a una API moderna. La operación externa de red se modela por un contrato explícito: **no** se presume que su respuesta sea correcta.

## Competencias a lograr

1. Derivar una API desde un contrato `P/Q` hasta guardas y asignaciones, justificando por `wp` las validaciones.
2. Traducir la derivación a dos procesos FastAPI mínimos, uno API pública y otro proveedor de inferencia demostrativo, con resultados controlados.
3. Producir pruebas para casos válidos, entradas inválidas, respuesta corrupta, error de proveedor y timeout; etiquetar garantías limitadas.

**Evidencias:** `derivation.md`, código íntegro para tres archivos Python, pruebas ejecutadas, informe de supuestos y checklist de aceptación.

## A. Caso de uso y alcance

Una aplicación empresarial necesita exponer `POST /predict` para clientes. El usuario envía edad, ingresos y antigüedad de relación; la API pública valida la petición e invoca a un proceso de inferencia. En éxito devuelve probabilidad de abandono y versión del modelo. Ante entrada inválida, **no invoca** el modelo; ante fallo externo o respuesta incompatible, devuelve un error controlado.

La API del modelo en este laboratorio utiliza una **fórmula determinística de demostración** para evitar requerir artefactos de entrenamiento. **No representa un modelo entrenado ni constituye una estimación estadística validada.** En producción se reemplaza solo esa parte respetando el contrato de respuesta.

```mermaid
flowchart LR
 A[Cliente HTTP] --> B[API pública :8000]
 B -->|input válido| C[Servicio de inferencia :8001]
 C -->|Returned / error| B
 B -->|success o error| A
```

### Requisitos

- Entrada JSON con `age` entero de 0 a 120, `income` numérico finito de 0 a 1 000 000, `tenure` entero de 0 a 600.
- En éxito, `prediction` numérica finita en `[0,1]`, `model_version` cadena no vacía.
- No realizar llamadas upstream con entrada inválida.
- Una sola invocación upstream por request válido (sin retries implícitos de aplicación).
- Diferenciar entrada inválida (`422`), timeout (`504`) y falla/respuesta inválida del upstream (`502`).
- Sujeto al contrato de bibliotecas y entorno, el endpoint devuelve respuesta controlada; no se garantiza un deadline absoluto de proceso.

## B. Espacio de estados y postcondición

Sea `x=(a,i,t)`; `result` el resultado externo discriminado y `resp` la respuesta pública:

$$V(x)\equiv0\le a\le120\land0\le i\le10^6\land finite(i)\land0\le t\le600,$$

con `a,t` enteros e `i` real. Sea:

$$R(p,v)\equiv 0\le p\le1\land finite(p)\land isinstance(v,string)\land |trim(v)|>0.$$

Contrato observable:

$$\begin{aligned}
Q\equiv{}& (Success(p,v)\Rightarrow V(x)\land Returned(p,v)\land R(p,v))\\
&\land (InvalidInput\Rightarrow\neg V(x))\\
&\land (InferenceError\Rightarrow V(x)\land externalFailure)\\
&\land (\neg V(x)\Rightarrow calls=0)\\
&\land (V(x)\Rightarrow calls\le1).
\end{aligned}$$

`externalFailure` incluye timeout, error HTTP, JSON inválido o resultado que no cumple `R`. `calls` cuenta intentos explícitos de aplicación realizados por esta API, no paquetes TCP ni operaciones internas de bibliotecas. Se presupone que el validador clasifica los JSON de acuerdo con `V`.

## C. Derivación paso a paso

**Paso 1, selección por validez.** Partimos de `Q`; la rama `¬V` debe establecer `InvalidInput` con `calls=0`. Como no se llama el upstream antes de la selección, la condición se preserva.

**Paso 2, caso `V`.** Introducimos una operación externa abstracta `Invoke(x)` con resultados `Returned(p,v)`, `TimedOut`, `Failed(e)`. **Supuesto:** dentro del modelo de ejecución considerado, `Invoke` retorna una de esas variantes o emite una excepción representada por ellas. No se demuestra que la red siempre retorne físicamente.

**Paso 3, `wp` de la asignación de éxito.**

$$\begin{aligned}
wp.(prediction,version:=p,v).R(prediction,version)
&\equiv R(p,v)\\
&\equiv0\le p\le1\land finite(p)\land validVersion(v).
\end{aligned}$$

Por tanto, la guarda de éxito **necesita** `R(p,v)`, no una comprobación post hoc.

**Paso 4, completar selección.** Una respuesta recibida que no satisface `R` debe tomar la rama de error, nunca `Success`. Timeout y falla HTTP toman también error, conservando `V`.

```text
if ¬V(x) → resp:=InvalidInput
[] V(x) →
    result:=Invoke(x);
    if result=Returned(p,v) ∧ R(p,v) → resp:=Success(p,v)
    [] result=Returned(p,v) ∧ ¬R(p,v) → resp:=InferenceError
    [] result=TimedOut → resp:=InferenceError
    [] result=Failed(e) → resp:=InferenceError
    fi
fi
```

**Paso 5, terminación y eficiencia.** No hay ciclo propio de la API; las selecciones son finitas una vez conocido el resultado `Invoke`. La afirmación de terminación queda **condicionada** al contrato temporal y de retorno de la operación externa. El trabajo adicional de la API es `O(1)` respecto de tres campos fijos, sin contar tiempo de red ni complejidad del modelo.

## D. Implementación completa: archivos y dependencias

Crear una carpeta vacía `api_ml_formal/` y guardar los tres bloques siguientes en archivos del mismo nombre. Requisitos: Python 3.11+, `fastapi`, `uvicorn`, `httpx`, `pydantic` versión 2, `pytest`. Instalar:

```bash
python -m venv .venv
# Activar entorno; en PowerShell: .venv\Scripts\Activate.ps1
python -m pip install 'fastapi>=0.110' 'uvicorn>=0.29' 'httpx>=0.27' 'pydantic>=2' 'pytest>=8'
```

### D.1 · `model_service.py` — servicio de inferencia demostrativo

```python
from math import exp
from fastapi import FastAPI
from pydantic import BaseModel, Field, StrictInt

app = FastAPI(title="Servicio de inferencia (demostración)")

class ModelInput(BaseModel):
    age: StrictInt = Field(ge=0, le=120)
    income: float = Field(strict=True, ge=0, le=1_000_000,
                          allow_inf_nan=False)
    tenure: StrictInt = Field(ge=0, le=600)

class ModelOutput(BaseModel):
    prediction: float
    model_version: str

@app.post("/predict", response_model=ModelOutput)
async def predict(data: ModelInput):
    # Fórmula ilustrativa, NO un modelo entrenado.
    z = -2.0 + 0.01 * data.age + 0.00002 * data.income + 0.03 * data.tenure
    probability = 1.0 / (1.0 + exp(-z))
    return ModelOutput(prediction=probability, model_version="demo-1.0")
```

**Contrato del stub:** dada una entrada acotada válida, las operaciones son finitas y el sigmoide queda en `(0,1)` matemáticamente. `response_model` convierte la salida al contrato JSON. La red y el proceso siguen siendo externos desde la perspectiva de la API pública.

### D.2 · `app.py` — API pública

```python
import math
from typing import Protocol
import httpx
from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, Field, StrictInt

MODEL_URL = "http://127.0.0.1:8001/predict"
app = FastAPI(title="API de predicción derivada")

class PredictionInput(BaseModel):
    age: StrictInt = Field(ge=0, le=120)
    income: float = Field(strict=True, ge=0, le=1_000_000,
                          allow_inf_nan=False)
    tenure: StrictInt = Field(ge=0, le=600)

class PredictionOutput(BaseModel):
    prediction: float
    model_version: str

class Gateway(Protocol):
    async def predict(self, data: dict) -> object: ...

class HttpGateway:
    async def predict(self, data: dict) -> object:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(MODEL_URL, json=data)
            response.raise_for_status()
            return response.json()

def get_gateway() -> Gateway:
    return HttpGateway()

@app.post("/predict", response_model=PredictionOutput)
async def predict(data: PredictionInput,
                  gateway: Gateway = Depends(get_gateway)):
    # Pydantic hace cumplir V(x) antes de ingresar al cuerpo.
    try:
        result = await gateway.predict(data.model_dump())
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504,
                            detail="Inferencia fuera de tiempo") from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502,
                            detail="Error del servicio ML") from exc

    # La respuesta no es confiable hasta demostrar R(p,v).
    if not isinstance(result, dict):
        raise HTTPException(status_code=502, detail="Salida ML inválida")

    probability = result.get("prediction")
    version = result.get("model_version")
    valid = (
        type(probability) in (int, float)
        and math.isfinite(probability)
        and 0 <= probability <= 1
        and isinstance(version, str)
        and bool(version.strip())
    )
    if not valid:
        raise HTTPException(status_code=502, detail="Salida ML inválida")

    return PredictionOutput(prediction=float(probability),
                            model_version=version)
```

**Sobre `Depends`:** la inyección permite sustituir la dependencia externa por un doble de prueba, sin modificar la derivación del endpoint. `PredictionInput` impone rangos y tipos antes de invocar `predict`, por lo que entradas inválidas generan `422` y no acceden al gateway.

### D.3 · `test_app.py` — pruebas reproducibles

```python
import httpx
from fastapi.testclient import TestClient
from app import app, get_gateway

client = TestClient(app)
VALID = {"age": 35, "income": 4500.0, "tenure": 12}

class FakeGateway:
    def __init__(self, answer=None, error=None):
        self.calls = 0
        self.answer = answer
        self.error = error

    async def predict(self, data: dict):
        self.calls += 1
        if self.error is not None:
            raise self.error
        return self.answer

def request_with(fake, payload):
    app.dependency_overrides[get_gateway] = lambda: fake
    try:
        return client.post("/predict", json=payload)
    finally:
        app.dependency_overrides.clear()

def test_success_provenance_and_one_call():
    fake = FakeGateway({"prediction": 0.82, "model_version": "v1"})
    response = request_with(fake, VALID)
    assert response.status_code == 200
    assert response.json() == {"prediction": 0.82, "model_version": "v1"}
    assert fake.calls == 1

def test_invalid_request_never_calls_model():
    fake = FakeGateway({"prediction": 0.6, "model_version": "v1"})
    response = request_with(fake, {**VALID, "age": -1})
    assert response.status_code == 422
    assert fake.calls == 0

def test_nan_like_invalid_response():
    fake = FakeGateway({"prediction": float("nan"), "model_version": "v1"})
    response = request_with(fake, VALID)
    assert response.status_code == 502
    assert fake.calls == 1

def test_missing_version():
    fake = FakeGateway({"prediction": 0.5})
    assert request_with(fake, VALID).status_code == 502

def test_upstream_error():
    fake = FakeGateway(error=httpx.ConnectError("no connection"))
    assert request_with(fake, VALID).status_code == 502

def test_timeout():
    fake = FakeGateway(error=httpx.ReadTimeout("timeout"))
    assert request_with(fake, VALID).status_code == 504

def test_rejects_boolean_probability():
    fake = FakeGateway({"prediction": True, "model_version": "v1"})
    assert request_with(fake, VALID).status_code == 502
```

## E. Ejecución

Abrir dos terminales distintas dentro de `api_ml_formal/`:

```bash
# Terminal 1
uvicorn model_service:app --port 8001

# Terminal 2
uvicorn app:app --port 8000

# Terminal de prueba
pytest -q test_app.py
```

Ejemplo con `curl`:

```bash
curl -X POST http://127.0.0.1:8000/predict \
  -H 'Content-Type: application/json' \
  -d '{"age":35,"income":4500,"tenure":12}'
```

La respuesta debe contener `prediction` entre `0` y `1` y `model_version:"demo-1.0"`.

## F. Matriz de obligaciones y evidencia

| Obligación | Origen de derivación | Evidencia incluida | Estado |
|---|---|---|---|
| PO-01 entrada inválida no llama upstream | Guarda `¬V` | `test_invalid_request_never_calls_model` | Evidenciada |
| PO-02 éxito requiere valor válido | `wp` de asignación | `test_success...`, `test_nan...`, `test_rejects_boolean...` | Evidenciada; razonamiento matemático bajo hipótesis |
| PO-03 procede del upstream | Contrato `Returned(p,v)` | `test_success_provenance...` | Evidenciada |
| PO-04 upstream defectuoso no produce éxito | Selección exhaustiva | `test_missing_version`, `test_upstream_error` | Evidenciada |
| PO-05 timeout controlado | Variante `TimedOut` | `test_timeout` | Evidenciada bajo API HTTPX |
| PO-06 tiempo máximo absoluto | No se sigue de las reglas | Ninguna | No garantizado |
| PO-07 exactitud estadística del modelo | Fuera del contrato de control | Ninguna | No garantizado |

No presentar la matriz como prueba formal de toda la pila: las garantías sobre ejecución Python/FastAPI/HTTPX se basan en sus contratos y los tests ejecutados en el ambiente correspondiente.

## G. Actividad de extensión

Agregar `request_id` y derivar la nueva postcondición: **si hay éxito, el identificador de la respuesta coincide con el de la solicitud**, y **no cambia la probabilidad recibida del modelo**. Actualizar la spec, el código y al menos dos pruebas. Después, el revisor independiente debe comprobar el diff contra `Q` original y extendida.

## Criterios de aprobación

- [ ] La spec expresa las tres clases de salida.
- [ ] Las guardas son exhaustivas bajo el contrato externo declarado.
- [ ] La condición `R` sale de una precondición más débil razonada.
- [ ] La API no llama el gateway ante entrada inválida.
- [ ] Los tests separan éxito, error y timeout.
- [ ] No se afirma exactitud ML ni deadline absoluto.
- [ ] Se entregan límites de demostración y complejidad.
