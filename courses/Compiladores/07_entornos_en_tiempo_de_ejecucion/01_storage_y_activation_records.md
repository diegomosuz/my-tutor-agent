# Organización de almacenamiento y registros de activación

**Módulo 07.**

## Cobertura

Cubre 7.1 y 7.2.

## Idea central

El runtime convierte abstracciones como variables locales, llamadas y retornos en ubicaciones y protocolos concretos de memoria. El compilador debe decidir qué valores viven en registros, cuáles requieren slots de stack, qué estado debe preservarse a través de una llamada y cómo se recupera el control al retornar.

## Segmentos lógicos de memoria

Un proceso suele distinguir código, datos estáticos, heap y stack. El detalle exacto depende del sistema operativo, formato de ejecutable y runtime, pero el modelo conceptual es estable. El código contiene instrucciones; globals y constantes de vida estática residen en áreas de datos; el heap aloja objetos cuya vida no coincide con una llamada; y el stack representa, de forma natural, la disciplina LIFO de llamadas y retornos.

La separación no implica que cada lenguaje use todas estas regiones de la misma manera. Un compilador puede mantener una variable local exclusivamente en un registro; en ese caso, la variable existe semánticamente aunque nunca tenga una dirección de stack mientras no sea necesario materializarla en memoria.

## Activation record o stack frame

Cada invocación de una función necesita una instancia de su estado. Ese estado se representa mediante un **registro de activación**. Un frame puede contener:

- dirección de retorno;
- frame pointer anterior, si se usa;
- registros callee-saved que la función modifica;
- argumentos que no caben en los registros definidos por la ABI;
- variables locales que requieren memoria;
- temporales derramados por register allocation;
- padding para alineación;
- espacio reservado para llamadas salientes, según la convención adoptada.

La propiedad importante no es un layout universal, sino que caller y callee compartan el mismo contrato. Dos compiladores diferentes pueden interoperar si respetan la misma ABI.

## Caller-saved y callee-saved

Los registros físicos son un recurso compartido entre funciones. La calling convention divide responsabilidades:

- **caller-saved:** la función llamada puede destruirlos. Si el caller necesita conservar un valor, debe salvarlo antes de la llamada o asignarlo a otro registro;
- **callee-saved:** si la función llamada los modifica, debe restaurarlos antes de retornar.

Esta clasificación influye directamente en register allocation. Un valor vivo a través de una llamada puede preferirse en un registro callee-saved, pero usarlo puede obligar al callee a salvar/restaurar el registro. El costo depende del contexto.

## Ejemplo trabajado: recursión

Considere:

```c
int fact(int n) {
    if (n <= 1) return 1;
    return n * fact(n - 1);
}
```

Durante `fact(3)` existen activaciones diferentes de `fact(3)`, `fact(2)` y `fact(1)`. El símbolo `n` es único en la tabla de símbolos estática de la función, pero cada llamada necesita su propio valor dinámico de `n`. Esa es precisamente la diferencia entre **identidad estática del símbolo** e **instancia dinámica de almacenamiento**.

En una ABI RISC-V típica, los primeros argumentos escalares se pasan en `a0-a7`, el retorno escalar llega en `a0`, `ra` contiene la dirección de retorno y `sp` apunta al stack. Si `fact` necesita preservar `ra` a través de su llamada recursiva, debe salvarlo antes de ejecutar el `call` y restaurarlo antes de `ret`.

## Traslado a implementación

Antes de emitir prologue y epilogue, construya una estructura `FrameLayout` que determine:

```text
FrameLayout
  frame_size
  saved_registers
  local_slots
  spill_slots
  outgoing_arg_area
  alignment
```

El backend debe consultar esta estructura en lugar de dispersar offsets constantes. El prologue y epilogue se convierten entonces en dos materializaciones simétricas del mismo layout.

![Pila de llamadas](images/call_stack.png)

## Errores conceptuales frecuentes

- Suponer una única instancia de variables locales durante recursión.
- Confundir el símbolo estático con su ubicación dinámica.
- Modificar `sp` en caminos diferentes sin restaurarlo de manera consistente.
- Violar la alineación exigida por la ABI.
- Salvar todos los registros indiscriminadamente y convertir la convención de llamada en un mecanismo innecesariamente costoso.

## Ejercicios de dominio

1. Diseñe un frame para una función con diez argumentos enteros y dos variables locales cuya dirección se toma.
2. Determine qué valores debe preservar un caller cuando están vivos a través de una llamada.
3. Dibuje la evolución de `sp`, `ra` y los frames durante `fact(3)`.
4. Explique cuándo un local puede no recibir ningún stack slot.

## Preguntas de control

- ¿Qué parte del layout proviene del lenguaje y qué parte de la ABI?
- ¿Por qué recursión exige instancias dinámicas diferentes del mismo símbolo?
- ¿Qué relación existe entre liveness, register allocation y frame layout?
- ¿Cómo verificaría que todos los caminos de retorno restauran el stack correctamente?
