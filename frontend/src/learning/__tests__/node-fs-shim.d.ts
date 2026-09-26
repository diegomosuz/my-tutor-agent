// Declaración ambiente mínima (Bloque 4, v1.7.0) -- evita agregar
// `@types/node` como dependencia nueva (proyecto sin dependencias
// nuevas por diseño, ver CLAUDE.md) solo para tipar las 2 funciones que
// `learningStateParity.test.ts` usa para leer el fixture compartido
// (`fixtures/learning_state_parity.json`, montado en tiempo de ejecución
// por Vitest/Node -- nunca en runtime del browser real).
declare module "node:fs" {
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string, encoding: string): string;
}
