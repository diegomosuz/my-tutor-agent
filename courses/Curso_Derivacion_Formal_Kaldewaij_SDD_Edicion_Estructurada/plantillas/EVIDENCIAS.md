# Evidencias de corrección y eficiencia — SPEC-NNN

## Propósito

Mostrar exactamente **qué se verificó** y cómo; evitar la expresión «formalmente verificado» cuando solamente se ejecutaron tests.

## Tabla

| Obligación | Fuente en Q/I | Derivación matemática | Test/herramienta | Resultado | Limitaciones |
|---|---|---|---|---|---|
| PO-001 | `[fórmula]` | `[ley]` | `[comando]` | PROBADO / EVIDENCIADO / PENDIENTE | `[supuestos]` |

## Registro de comandos ejecutados

```text
# Comandos, versión del runtime, fecha y salida resumida
```

## Contraejemplos y decisiones

- Propiedad refutada: `[predicado]`.
- Estado que la refuta: `[valores]`.
- Modificación resultante: `[spec, derivation o código]`.
- Revisión independiente: `[quién o mecanismo]`.

## Aceptación

- [ ] Todas las PO críticas están cerradas o tienen excepción formalmente aceptada.
- [ ] Los tests corresponden a las propiedades correctas.
- [ ] La complejidad se analiza sobre implementación concreta.
- [ ] Se declararon fuentes de no determinismo y fallas externas.
