import type { TutorCourseSource } from "../types/api";
import type { TutorAnswerProvenance, TutorConversationMessage } from "./useTutor";

export interface TutorConversationProps {
  messages: TutorConversationMessage[];
  /** Solo en modo desarrollo: permite ver qué SourceBlocks respaldan cada
   * respuesta del tutor. Nunca se muestra al alumno en producción. */
  showSourceRefs: boolean;
  onInspectRef?: (ref: string) => void;
  /** v1.4.0 (Bloque 3): navega al tópico de origen de una fuente de
   * COURSE EVIDENCE ("Ver tema relacionado"). Reutiliza la navegación
   * curricular ya existente de ClassroomPage (`goToTopic`) -- nunca un
   * segundo sistema de routing. Si no se provee, el CTA simplemente no
   * hace nada (defensivo, nunca debería pasar en producción real). */
  onNavigateToTopic?: (moduleId: string, topicId: string) => void;
}

/** Renderiza la conversación como texto React plano (nunca
 * `dangerouslySetInnerHTML`, nunca interpreta Markdown ni HTML producido
 * por el tutor — ver Fase 5, sección 30). */
export function TutorConversation({
  messages,
  showSourceRefs,
  onInspectRef,
  onNavigateToTopic,
}: TutorConversationProps) {
  if (messages.length === 0) {
    return (
      <p className="tutor-conversation__empty">
        Todavía no hiciste ninguna pregunta sobre este tema.
      </p>
    );
  }

  return (
    <div className="tutor-conversation" role="log" aria-live="polite">
      {messages.map((message) => (
        <div key={message.id} className={`tutor-message tutor-message--${message.role}`}>
          <span className="tutor-message__role">{message.role === "user" ? "Vos" : "Tutor"}</span>
          {message.provenance ? (
            <TutorAnswerGroups
              provenance={message.provenance}
              onNavigateToTopic={onNavigateToTopic}
            />
          ) : (
            <p className="tutor-message__content">{message.content}</p>
          )}
          {showSourceRefs && message.sourceRefs && message.sourceRefs.length > 0 && (
            <div className="tutor-message__refs">
              {message.sourceRefs.map((ref) => (
                <button
                  key={ref}
                  type="button"
                  className="grounding-panel__ref-chip"
                  onClick={() => onInspectRef?.(ref)}
                >
                  {ref}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * v1.4.0 (Bloque 3, "Provenance UX"): una misma respuesta puede combinar
 * hasta tres orígenes -- tópico actual, resto del curso, conocimiento
 * general -- y la UI los muestra como grupos separados, en ese orden
 * (PARTE 7 de la especificación), cada uno con una etiqueta pequeña y
 * discreta. El alumno nunca ve "SRC-XXX"/"COURSE-SRC-XXX": solo un label
 * en español que dice de dónde viene esa parte de la respuesta.
 */
function TutorAnswerGroups({
  provenance,
  onNavigateToTopic,
}: {
  provenance: TutorAnswerProvenance;
  onNavigateToTopic?: (moduleId: string, topicId: string) => void;
}) {
  return (
    <div className="tutor-message__groups">
      {provenance.currentTopicTexts.length > 0 && (
        <div className="tutor-provenance-group">
          <span className="tutor-provenance-label tutor-provenance-label--topic">
            Basado en este tema
          </span>
          <p className="tutor-message__content">{provenance.currentTopicTexts.join("\n\n")}</p>
        </div>
      )}
      {provenance.courseTexts.length > 0 && (
        <div className="tutor-provenance-group">
          <span className="tutor-provenance-label tutor-provenance-label--course">
            Basado en el curso
          </span>
          <p className="tutor-message__content">{provenance.courseTexts.join("\n\n")}</p>
          {provenance.courseSources.length > 0 && (
            <RelatedTopics sources={provenance.courseSources} onNavigateToTopic={onNavigateToTopic} />
          )}
        </div>
      )}
      {provenance.generalTexts.length > 0 && (
        <div className="tutor-provenance-group">
          <span className="tutor-provenance-label tutor-provenance-label--general">
            Ampliado con conocimiento general
          </span>
          <p className="tutor-message__content">{provenance.generalTexts.join("\n\n")}</p>
        </div>
      )}
    </div>
  );
}

/** "Temas relacionados": un item por tópico de origen (ya deduplicado,
 * ver `courseSources.ts`), cada uno con un CTA "Ver tema relacionado"
 * que reutiliza la navegación curricular existente -- nunca marca el
 * tópico actual ni el de destino como completado (eso solo lo hace
 * `handleCompleteTopic` en ClassroomPage, nunca esta navegación). */
function RelatedTopics({
  sources,
  onNavigateToTopic,
}: {
  sources: TutorCourseSource[];
  onNavigateToTopic?: (moduleId: string, topicId: string) => void;
}) {
  return (
    <div className="tutor-related-topics">
      <span className="tutor-related-topics__title">Temas relacionados</span>
      {sources.map((source) => (
        <div key={`${source.module_id}::${source.topic_id}`} className="tutor-related-topic">
          <div className="tutor-related-topic__info">
            <span className="tutor-related-topic__module">{source.module_title}</span>
            <span className="tutor-related-topic__topic">{source.topic_title}</span>
          </div>
          <button
            type="button"
            className="tutor-related-topic__cta"
            onClick={() => onNavigateToTopic?.(source.module_id, source.topic_id)}
            aria-label={`Ver tema relacionado: ${source.topic_title}`}
          >
            Ver tema relacionado →
          </button>
        </div>
      ))}
    </div>
  );
}
