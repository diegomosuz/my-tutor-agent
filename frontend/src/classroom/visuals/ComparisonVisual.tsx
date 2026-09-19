import { useMemo } from "react";
import type { VisualComponentProps } from "./types";
import { buildAnimationSequence } from "../pedagogicalAnimation";
import { usePedagogicalAnimation } from "../usePedagogicalAnimation";
import { pedagogicalStatusClass } from "./pedagogicalStatusClass";

/** visual_type = "comparison": usa `visual.comparison` (v1.1.0, contenido
 * estructurado real) cuando viene poblado:
 * - con `rows` -> tabla de contraste real (una fila por aspecto, una
 *   columna por elemento comparado);
 * - sin `rows` pero con `columns` (v1.2.0, bloque "Visual Fidelity" — bug
 *   real corregido: antes, en modo cards, TODAS las columnas mostraban
 *   exactamente los mismos `key_points` de la escena, porque no existía
 *   ningún campo que permitiera contenido propio por columna) -> una card
 *   por columna, usando `columns[i].points` — contenido realmente
 *   distinto entre columnas, nunca repetido;
 * - sin `rows` NI `columns` (modo "cards" legacy, LessonPlans de
 *   lesson-v3 anteriores a v1.2.0) -> una card por columna, reutilizando
 *   los `key_points` compartidos de la escena en todas — comportamiento
 *   IDÉNTICO al de antes, nunca se invalida ni se rompe una cache vieja.
 * Si `comparison` no viene poblado (robustez ante cache aún más vieja),
 * cae al comportamiento anterior: 2 key_points -> pares A/B, si no, cards
 * neutrales sin etiqueta de grupo inventada.
 *
 * Animación pedagógica (v1.2.0, bloque "Pedagogical Animations", PARTE
 * 10): la comparación requiere SIMULTANEIDAD, nunca "A y mucho después
 * B". Modo tabla (`rows`): header primero, luego cada fila COMPLETA (con
 * todas sus columnas) como un único paso — la progresión es entre filas,
 * nunca entre columnas de una misma fila. Modo cards (`columns` o
 * legacy): todas las cards en un único paso simultáneo — no existe un
 * concepto de "fila" en ese modo, nada que secuenciar sin inventar un
 * orden que la fuente no da. */
export function ComparisonVisual({ scene, isPaused }: VisualComponentProps) {
  const comparison = scene.visual.comparison;
  const sequence = useMemo(() => buildAnimationSequence(scene), [scene]);
  const anim = usePedagogicalAnimation(sequence, isPaused);

  if (comparison && comparison.rows.length === 0 && comparison.columns.length > 0) {
    const groupStatus = pedagogicalStatusClass(anim.elementStatus("comparison-columns"));
    return (
      <div className="visual visual--comparison">
        <h3 className="visual__title">{scene.title.text}</h3>
        <div className={`visual-comparison__grid ${groupStatus}`}>
          {comparison.columns.map((column, i) => (
            <div key={i} className="visual-comparison__card">
              <span className="visual-comparison__side">{column.title}</span>
              <ul className="visual-comparison__card-points">
                {column.points.map((point, j) => (
                  <li key={j}>{point}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (comparison && comparison.rows.length > 0) {
    const headerStatus = pedagogicalStatusClass(anim.elementStatus("comparison-header"));
    return (
      <div className="visual visual--comparison visual--comparison-table">
        <h3 className="visual__title">{scene.title.text}</h3>
        <div className="visual-comparison__table-wrap">
          <table className="visual-comparison__table">
            <thead>
              <tr className={headerStatus}>
                <th />
                {comparison.column_labels.map((label, i) => (
                  <th key={i}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparison.rows.map((row, ri) => (
                <tr key={ri} className={pedagogicalStatusClass(anim.elementStatus(`row-${ri}`))}>
                  <th scope="row">{row.label}</th>
                  {row.values.map((value, ci) => (
                    <td key={ci}>{value}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (comparison) {
    const groupStatus = pedagogicalStatusClass(anim.elementStatus("comparison-columns"));
    return (
      <div className="visual visual--comparison">
        <h3 className="visual__title">{scene.title.text}</h3>
        <div className={`visual-comparison__grid ${groupStatus}`}>
          {comparison.column_labels.map((label, i) => (
            <div key={i} className="visual-comparison__card">
              <span className="visual-comparison__side">{label}</span>
              <ul className="visual-comparison__card-points">
                {scene.key_points.map((kp, j) => (
                  <li key={j}>{kp.text}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Fallback (sin contenido estructurado): comportamiento anterior, sin
  // animación pedagógica (no hay VisualPlan estructurado sobre el cual
  // construir una secuencia determinística).
  const points = scene.key_points;
  const isPairwise = points.length === 2;
  return (
    <div className="visual visual--comparison">
      <h3 className="visual__title">{scene.title.text}</h3>
      <div className={`visual-comparison__grid${isPairwise ? " visual-comparison__grid--pair" : ""}`}>
        {points.length > 0 ? (
          points.map((p, i) => (
            <div
              key={i}
              className="visual-comparison__card classroom-stagger-item"
              style={{ animationDelay: `${0.12 * i}s` }}
            >
              {isPairwise && (
                <span className="visual-comparison__side" aria-hidden="true">
                  {i === 0 ? "A" : "B"}
                </span>
              )}
              <p>{p.text}</p>
            </div>
          ))
        ) : (
          <div className="visual-comparison__card classroom-stagger-item">
            <p>{scene.title.text}</p>
          </div>
        )}
      </div>
    </div>
  );
}
