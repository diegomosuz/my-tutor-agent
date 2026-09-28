# Ejercicios resueltos

## 1. Scope
```c
int x;
{
  bool x;
  x = true;
}
x = 4;
```
Los dos usos resuelven a símbolos diferentes. El uso interior tiene tipo `bool`; el exterior `int`. Comparar solo el lexema `x` rompería el type checker y backend.

## 2. Short-circuit
`a != 0 && 10/a > 2` no puede compilarse evaluando ambas comparaciones incondicionalmente: cuando `a==0`, la semántica exige que la división no ocurra. El IR debe ramificar después de la primera condición.
