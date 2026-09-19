// Componente compartido de diagrama (v1.2.0, bloque "Visual Fidelity"):
// dibuja conectores geométricos REALES (SVG calculado por React a partir
// de posiciones medidas del DOM) en vez de una lista de texto "A -> B".
// Usado por ArchitectureVisual (layout "grid") y ConceptMapVisual (layout
// "radial"). Nunca acepta coordenadas, SVG, CSS ni markup del LLM: el
// único dato que viene del LLM es `nodes`/`edges` (ids, labels, relation
// types de un enum cerrado) — todo el layout y el dibujo lo decide este
// componente.
import type { ReactNode } from "react";
import type { GraphEdge, GraphNode } from "../../types/api";
import { edgeLabelForDisplay, relationText, useDiagramEdgeGeometry } from "./diagramGeometry";

export interface DiagramCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  layout: "grid" | "radial";
  renderNode: (node: GraphNode, index: number) => ReactNode;
  /** Solo para layout="radial": elemento central FIJO (p.ej. el título de
   * la escena) — nunca un GraphNode, nunca tiene `id`, nunca puede ser
   * `from_id`/`to_id` de una `edge` (esa garantía ya existe: el backend
   * valida que toda edge referencia nodes declarados). Todos los `nodes`
   * se distribuyen alrededor de este centro, sin distinguir "el primero"
   * como especial — el LLM nunca es instruido a poner un nodo central en
   * una posición particular del array. */
  centerLabel?: ReactNode;
  /** Clase adicional para el contenedor de nodos (permite reusar estilos
   * específicos de architecture/concept_map sobre este esqueleto común). */
  nodesClassName?: string;
}

/** Radio del layout radial como fracción del lado más chico del
 * contenedor — determinístico, sin física ni force-layout (PARTE 7). */
const RADIAL_RADIUS_RATIO = 0.36;

export function DiagramCanvas({
  nodes,
  edges,
  layout,
  renderNode,
  centerLabel,
  nodesClassName,
}: DiagramCanvasProps) {
  const { containerRef, registerNode, lines } = useDiagramEdgeGeometry(edges);

  return (
    <div className={`diagram-canvas diagram-canvas--${layout}`} ref={containerRef}>
      <svg className="diagram-canvas__edges" aria-hidden="true">
        <defs>
          <marker
            id="diagram-canvas-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="diagram-canvas__arrowhead" />
          </marker>
        </defs>
        {lines.map((line) => {
          const label = edgeLabelForDisplay(line.label);
          const midX = (line.from.x + line.to.x) / 2;
          const midY = (line.from.y + line.to.y) / 2;
          return (
            <g key={line.key}>
              <line
                x1={line.from.x}
                y1={line.from.y}
                x2={line.to.x}
                y2={line.to.y}
                className="diagram-canvas__edge-line"
                markerEnd={line.directed ? "url(#diagram-canvas-arrow)" : undefined}
              />
              {label && (
                <text x={midX} y={midY} className="diagram-canvas__edge-label">
                  {label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {layout === "radial" ? (
        <RadialNodes nodes={nodes} registerNode={registerNode} renderNode={renderNode} centerLabel={centerLabel} />
      ) : (
        <div className={`diagram-canvas__nodes diagram-canvas__nodes--grid ${nodesClassName ?? ""}`}>
          {nodes.map((node, i) => (
            <div key={node.id} ref={registerNode(node.id)} className="diagram-canvas__node-slot">
              {renderNode(node, i)}
            </div>
          ))}
        </div>
      )}

      {edges.length > 0 && (
        <ul className="sr-only">
          {edges.map((edge, i) => (
            <li key={i}>{accessibleEdgeSentence(edge, nodes)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function accessibleEdgeSentence(edge: GraphEdge, nodes: GraphNode[]): string {
  const fromLabel = nodes.find((n) => n.id === edge.from_id)?.label ?? edge.from_id;
  const toLabel = nodes.find((n) => n.id === edge.to_id)?.label ?? edge.to_id;
  const suffix = edge.label ? `: ${edge.label}` : "";
  return `${fromLabel} ${relationText(edge.relation_type)} ${toLabel}${suffix}`;
}

function RadialNodes({
  nodes,
  registerNode,
  renderNode,
  centerLabel,
}: {
  nodes: GraphNode[];
  registerNode: (id: string) => (el: HTMLElement | null) => void;
  renderNode: (node: GraphNode, index: number) => ReactNode;
  centerLabel?: ReactNode;
}) {
  const count = nodes.length;
  if (count === 0)
    return centerLabel ? <div className="diagram-canvas__radial-center">{centerLabel}</div> : null;

  return (
    <div className="diagram-canvas__nodes diagram-canvas__nodes--radial">
      {centerLabel && <div className="diagram-canvas__radial-center">{centerLabel}</div>}
      {nodes.map((node, i) => {
        // Ángulos distribuidos uniformemente, empezando arriba (-90°) y
        // girando en sentido horario — determinístico, sin overlap por
        // construcción (mismo radio para todos, ángulo distinto cada uno).
        const angle = (2 * Math.PI * i) / count - Math.PI / 2;
        const x = 50 + RADIAL_RADIUS_RATIO * 100 * Math.cos(angle);
        const y = 50 + RADIAL_RADIUS_RATIO * 100 * Math.sin(angle);
        return (
          <div
            key={node.id}
            ref={registerNode(node.id)}
            className="diagram-canvas__radial-node"
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            {renderNode(node, i)}
          </div>
        );
      })}
    </div>
  );
}
