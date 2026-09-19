import { useMemo, type ComponentType } from "react";
import type { CanonicalInfo, LessonScene, VisualType } from "../types/api";
import { buildSourceBlockLookup } from "./sourceBlockLookup";
import { ArchitectureVisual } from "./visuals/ArchitectureVisual";
import { BulletsVisual } from "./visuals/BulletsVisual";
import { CodeVisual } from "./visuals/CodeVisual";
import { ComparisonVisual } from "./visuals/ComparisonVisual";
import { ConceptMapVisual } from "./visuals/ConceptMapVisual";
import { HeroVisual } from "./visuals/HeroVisual";
import { HierarchyVisual } from "./visuals/HierarchyVisual";
import { ImageVisual } from "./visuals/ImageVisual";
import { NoVisual } from "./visuals/NoVisual";
import { ProcessVisual } from "./visuals/ProcessVisual";
import { QuoteVisual } from "./visuals/QuoteVisual";
import { TableVisual } from "./visuals/TableVisual";
import type { VisualComponentProps } from "./visuals/types";

/**
 * Tabla de despacho SRC visual_type -> componente. Reemplaza un
 * if/else gigante en ClassroomPage: agregar un nuevo visual_type es
 * agregar una entrada acá, nunca tocar la página del aula.
 */
const VISUAL_RENDERERS: Record<VisualType, ComponentType<VisualComponentProps>> = {
  none: NoVisual,
  hero: HeroVisual,
  bullets: BulletsVisual,
  process: ProcessVisual,
  comparison: ComparisonVisual,
  hierarchy: HierarchyVisual,
  architecture: ArchitectureVisual,
  concept_map: ConceptMapVisual,
  table: TableVisual,
  code: CodeVisual,
  quote: QuoteVisual,
  image: ImageVisual,
};

export interface SceneRendererProps {
  scene: LessonScene;
  canonical: CanonicalInfo | null | undefined;
  renderKey: number;
  courseId: string;
  moduleId: string;
  topicId: string;
}

export function SceneRenderer({
  scene,
  canonical,
  renderKey,
  courseId,
  moduleId,
  topicId,
}: SceneRendererProps) {
  const lookupSourceBlock = useMemo(() => buildSourceBlockLookup(canonical), [canonical]);
  const Visual = VISUAL_RENDERERS[scene.visual.visual_type] ?? NoVisual;

  return (
    <div
      className={`scene-renderer classroom-scene-enter emphasis-${scene.visual.emphasis}`}
      key={`${scene.scene_id}-${renderKey}`}
    >
      <Visual
        scene={scene}
        lookupSourceBlock={lookupSourceBlock}
        renderKey={renderKey}
        courseId={courseId}
        moduleId={moduleId}
        topicId={topicId}
      />
    </div>
  );
}
