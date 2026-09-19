// "Golden lessons" (v1.1.0, PARTE 28): fixtures de LessonPlan estáticos
// para QA visual y tests de renderers, sin depender de ningún LLM real.
// Subconjunto representativo (no los 7 casos listados en la especificación
// original): process-heavy, comparison-heavy, architecture-heavy (incluye
// también code/concept_map) y minimal-topic. table-heavy/image-heavy no se
// incluyeron como fixtures dedicados porque TableVisual/ImageVisual ya
// tienen cobertura de renderer directa en
// frontend/src/classroom/visuals/__tests__/visuals.test.tsx y
// SceneRenderer.test.tsx — ver docs/LESSON_RENDERING.md.
export { ARCHITECTURE_HEAVY_LESSON } from "./architectureHeavy";
export { COMPARISON_HEAVY_LESSON } from "./comparisonHeavy";
export { MINIMAL_TOPIC_LESSON } from "./minimalTopic";
export { PROCESS_HEAVY_LESSON } from "./processHeavy";
