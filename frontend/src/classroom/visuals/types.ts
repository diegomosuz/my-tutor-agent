import type { LessonScene } from "../../types/api";
import type { SourceBlockLookup } from "../sourceBlockLookup";

/**
 * Contrato común de todos los visual renderers (Fase 4).
 *
 * REGLA DURA: la fuente de verdad visible en pantalla es `scene.title` /
 * `scene.key_points` (y, cuando corresponde, el SourceBlock resuelto vía
 * `lookupSourceBlock`). `scene.visual.description` NUNCA se renderiza como
 * texto: es una instrucción de presentación para el renderer (layout_hint
 * ya cubre eso explícitamente), no conocimiento pedagógico. Ningún
 * componente de este directorio debe leer `.description` para mostrar
 * contenido al alumno.
 */
export interface VisualComponentProps {
  scene: LessonScene;
  lookupSourceBlock: SourceBlockLookup;
  renderKey: number;
}
