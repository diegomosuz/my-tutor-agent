// Setup global de Vitest para tests que renderizan componentes React.
// Agrega los matchers de @testing-library/jest-dom (toBeInTheDocument, etc.)
// a `expect`. No se usa `globals: true` en vite.config.ts a propósito:
// cada test importa explícitamente lo que necesita de "vitest".
import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Sin `globals: true`, @testing-library/react no registra su cleanup
// automático (que depende de un `afterEach` global tipo Jest). Lo hacemos
// explícito acá para que cada test empiece con un DOM limpio.
afterEach(() => {
  cleanup();
});
