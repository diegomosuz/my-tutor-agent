// "Golden lessons" (v1.1.0 PARTE 28 + v1.2.0 PARTE 23): fixtures de
// LessonPlan estáticos para QA visual y tests de renderers, sin depender
// de ningún LLM real. process-heavy (4-5 process_steps), comparison-heavy
// (tabla real + cards legacy + cards con columns v1.2.0),
// architecture-heavy (4 nodes+edges reales, incluye también code/
// concept_map con 4 nodos relacionados), hierarchy-heavy (v1.2.0: raíz +
// 4 hijos vía nodes/edges, y una escena hierarchy LEGACY sin nodes para
// probar el fallback hacia atrás) y minimal-topic. table-heavy/image-heavy
// no se incluyeron como fixtures dedicados porque TableVisual/ImageVisual
// ya tienen cobertura de renderer directa en
// frontend/src/classroom/visuals/__tests__/visuals.test.tsx y
// SceneRenderer.test.tsx — ver docs/LESSON_RENDERING.md.
export { ARCHITECTURE_HEAVY_LESSON } from "./architectureHeavy";
export { COMPARISON_HEAVY_LESSON } from "./comparisonHeavy";
export { HIERARCHY_HEAVY_LESSON } from "./hierarchyHeavy";
export { MINIMAL_TOPIC_LESSON } from "./minimalTopic";
export { PROCESS_HEAVY_LESSON } from "./processHeavy";
