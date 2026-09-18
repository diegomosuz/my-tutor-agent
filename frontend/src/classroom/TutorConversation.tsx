import type { TutorConversationMessage } from "./useTutor";

export interface TutorConversationProps {
  messages: TutorConversationMessage[];
  /** Solo en modo desarrollo: permite ver qué SourceBlocks respaldan cada
   * respuesta del tutor. Nunca se muestra al alumno en producción. */
  showSourceRefs: boolean;
  onInspectRef?: (ref: string) => void;
}

/** Renderiza la conversación como texto React plano (nunca
 * `dangerouslySetInnerHTML`, nunca interpreta Markdown ni HTML producido
 * por el tutor — ver Fase 5, sección 30). */
export function TutorConversation({ messages, showSourceRefs, onInspectRef }: TutorConversationProps) {
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
          <p className="tutor-message__content">{message.content}</p>
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
