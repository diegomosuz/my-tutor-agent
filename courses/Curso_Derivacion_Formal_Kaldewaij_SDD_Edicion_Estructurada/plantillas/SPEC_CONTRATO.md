# SPEC-NNN — [capacidad funcional independiente]

## 1. Objetivo y frontera

**Historia/caso:** [qué usuario/proceso obtiene qué resultado].  
**Fuera de alcance:** [lo que NO resuelve].  
**Dependencias:** [contratos explícitos con otras specs o proveedores].

## 2. Estado y datos

- Constantes de entrada: `[nombre : dominio]`.
- Variables de salida: `[nombre : dominio]`.
- Efectos laterales admitidos: `[ninguno / tabla / servicio]`.
- Entorno/supuestos: `[red, BD, transacciones, tipos]`.

## 3. Precondición P

$$P\equiv[\text{expresión completa}]$$

Si la función acepta datos inválidos para devolver error controlado, modelar el estado **antes de validar** y definir predicado `V(x)` separado de `P`.

## 4. Postcondición Q

$$Q\equiv[\text{propiedades de éxito, error y efectos}]$$

Detallar procedencia, preservación de datos, determinismo esperado y restricciones.

## 5. Casos de selección

| Guarda | Postcondición local | Razonamiento de exhaustividad |
|---|---|---|
| `[B0]` | `[Q0]` | `[por qué]` |
| `[B1]` | `[Q1]` | `[por qué]` |

## 6. Requisitos no funcionales verificables

- Modelo de costo: `[N, elementos, llamadas, espacio]`.
- Restricciones de recursos: `[límite]`.
- Integración externa: `[contrato explícito y límite de la prueba]`.

## 7. Nivel de formalización

`A / B / C` y justificación de riesgo, siguiendo capítulo 14.

## 8. Obligaciones iniciales

- `PO-001`: `[fórmula]`
- `PO-002`: `[fórmula]`

## 9. Aceptación

- [ ] Los dominios y casos vacíos son claros.
- [ ] Los resultados de error no son implícitos.
- [ ] Las propiedades son verificables.
- [ ] Las dependencias cumplen `Q_proveedor ⇒ P_consumidor` o exigen adaptación.
