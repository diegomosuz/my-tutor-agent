# 13 · Contratos formales para software contemporáneo

**Módulo complementario (no forma parte del libro).** La notación y la derivación siguen a Kaldewaij; los dominios API/HTTP/ML son una aplicación actual. **Carga:** 4 h.

## Competencias a lograr

1. Modelar API, base de datos y servicios externos como operaciones con precondiciones, resultados, efectos y supuestos.
2. Separar corrección determinística del programa de propiedades no demostrables del ambiente (red, proveedor, modelo estadístico).
3. Derivar transiciones de estados y validaciones a partir de contratos, y trasladarlas a código Python/TypeScript de forma trazable.

**Evidencias:** contrato de un endpoint, tabla de casos exhaustiva, lista de garantías condicionadas y suite mínima de propiedades.

## 1. Nuevos dominios, mismas preguntas

En un programa de arreglos la «operación primitiva» es una asignación con semántica definida; en una API aparecen operaciones externas que pueden terminar con éxito, error o no respuesta. Para aplicar formalmente el método, se debe **definir el modelo de la operación externa** en lugar de fingir que `predict(x)` siempre retorna.

Una API se puede describir como transición de un estado de solicitud `req` a una respuesta `resp` y, si corresponde, cambios de estado persistente. El contrato es:

$$\{P(req,env)\}\ endpoint(req)\ \{Q(req,resp,env')\}.$$

`env` representa las partes observables del entorno de ejecución, según el alcance escogido. Si no se modelan cierres abruptos, fallas de host ni concurrencia, **no afirmar** que la prueba cubre dichos fenómenos.

## 2. Contrato de validación de un request ML

Entrada `x=(age,income,tenure)`:

$$V(x)\equiv age\in\mathbb{Z}_{\ge0}\land tenure\in\mathbb{Z}_{\ge0}\land income\in\mathbb{R}_{\ge0}\land finite(income).$$

Resultante del upstream:

```text
UpstreamResult =
    Returned(p, version)
  | TimedOut
  | Failed(reason)
```

Validez del resultado:

$$R(p,v)\equiv p\in\mathbb{R}\land finite(p)\land0\le p\le1\land validVersion(v).$$

Resultante pública:

```text
ApiResult =
    Success(prediction, model_version)
  | InvalidInput(details)
  | InferenceError(reason)
```

**Postcondiciones:**

1. `Success(p,v) ⇒ V(x) ∧ Returned(p,v) ∧ R(p,v)`.
2. `InvalidInput ⇒ ¬V(x)`.
3. `InferenceError ⇒ V(x) ∧ (TimedOut ∨ Failed ∨ Returned inválido)`.
4. `¬V(x) ⇒ upstream no invocado`.

La primera expresa **procedencia** de la predicción; no basta con devolver un número válido cualquiera.

## 3. Derivar una selección por casos

```text
if ¬V(x) → response := InvalidInput
[] V(x) →
   result := invoke_model(x);
   if result=Returned(p,v) ∧ R(p,v) → response:=Success(p,v)
   [] result=Returned(p,v) ∧ ¬R(p,v) → response:=InferenceError
   [] result=TimedOut → response:=InferenceError
   [] result=Failed(reason) → response:=InferenceError
   fi
fi
```

Las ramas son exhaustivas **solo si** `invoke_model` retorna una de las variantes declaradas. Se debe demostrar o asumir esa exhaustividad según la frontera de modelado. No se deriva un tiempo real garantizado de un timeout de biblioteca: puede haber scheduling del sistema operativo y trabajo previo/posterior a la llamada.

## 4. `wp` sobre validación de salida

Si la postcondición exige `0≤resp.prediction≤1` y se ejecuta `resp.prediction:=p`, entonces:

$$wp.(resp.prediction:=p).(0\le resp.prediction\le1)\equiv0\le p\le1.$$

Esto **obliga** a verificar ese rango antes de retornar `Success`. Si `p` puede ser `NaN`, el dominio matemático no coincide con una implementación de punto flotante: agregamos `finite(p)` explícitamente para que la traducción preserve significado.

## 5. Contratos para persistencia

Un `create` puede tener una postcondición que establezca existencia de un registro y unicidad de su clave; un `update` puede exigir que **solo** el registro indicado cambie. Se deriva una política de validación, lectura y escritura, pero las garantías de aislamiento y atomicidad dependen del contrato real de la transacción. Una especificación que exige `exactly-once` entre servicios externos sin protocolo ni supuestos adicionales **no puede darse por demostrada**.

## 6. Concurrencia y seguridad

El lenguaje de comandos guardados del libro no equivale por sí solo a una teoría completa de concurrencia, reintentos de redes, consistencia distribuida o seguridad informática. Para una API real se pueden imponer condiciones de seguridad y autenticación como **precondiciones del ambiente** o como obligaciones de otro componente; deben quedar visibles en la frontera de demostración.

## 7. Ejercicios

1. Agrega una entrada `request_id` y especifica la propiedad de correlación de respuesta.
2. Formaliza que la invocación upstream no ocurre si la validación falla.
3. Construye tabla total de casos si el upstream devuelve respuesta JSON con campo ausente.
4. Da un contraejemplo para «el modelo retorna en menos de cinco segundos» pese a configurar timeout=5.
5. Traduce una regla sobre persistencia a `P`, `Q` y efecto lateral permitido.

**Entrega:** contrato con una columna de **propiedades demostradas**, otra de **supuestos externos** y otra de **propiedades verificadas por test**.
