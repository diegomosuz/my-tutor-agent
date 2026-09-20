import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TutorConversation } from "../TutorConversation";
import type { TutorConversationMessage } from "../useTutor";

const MESSAGES: TutorConversationMessage[] = [
  { id: "1", role: "user", content: "¿Qué es Kubernetes?" },
  {
    id: "2",
    role: "assistant",
    content: "Kubernetes orquesta contenedores.",
    responseType: "answer",
    sourceRefs: ["SRC-002", "SRC-003"],
  },
];

describe("TutorConversation", () => {
  it("muestra un mensaje vacío cuando no hay conversación", () => {
    render(<TutorConversation messages={[]} showSourceRefs={false} />);
    expect(
      screen.getByText("Todavía no hiciste ninguna pregunta sobre este tema.")
    ).toBeInTheDocument();
  });

  it("renderiza los mensajes como texto plano (sin interpretar HTML/Markdown)", () => {
    const messages: TutorConversationMessage[] = [
      { id: "1", role: "user", content: "<b>hola</b> y *negrita*" },
    ];
    const { container } = render(<TutorConversation messages={messages} showSourceRefs={false} />);
    // El texto aparece literal; nunca se interpretó como HTML (no hay <b> real).
    expect(container.querySelector("b")).toBeNull();
    expect(screen.getByText("<b>hola</b> y *negrita*")).toBeInTheDocument();
  });

  it("7. las source_refs NO se muestran al alumno cuando showSourceRefs=false", () => {
    const { container } = render(
      <TutorConversation messages={MESSAGES} showSourceRefs={false} />
    );
    expect(container.textContent).not.toMatch(/SRC-\d{3}/);
  });

  it("8. las source_refs se muestran solo cuando showSourceRefs=true (debug de desarrollo)", () => {
    render(<TutorConversation messages={MESSAGES} showSourceRefs={true} />);
    expect(screen.getByText("SRC-002")).toBeInTheDocument();
    expect(screen.getByText("SRC-003")).toBeInTheDocument();
  });

  it("hacer click en una ref (en modo dev) llama a onInspectRef con esa referencia", () => {
    const onInspectRef = vi.fn();
    render(
      <TutorConversation messages={MESSAGES} showSourceRefs={true} onInspectRef={onInspectRef} />
    );
    screen.getByText("SRC-002").click();
    expect(onInspectRef).toHaveBeenCalledWith("SRC-002");
  });

  // --------------------------------------------------------------------
  // v1.4.0 (Bloque 3 -- "Provenance UX + Related Topic Navigation")
  // --------------------------------------------------------------------

  it("cuando provenance está presente, renderiza los grupos en vez del content plano", () => {
    const messages: TutorConversationMessage[] = [
      {
        id: "1",
        role: "assistant",
        content: "Un Pod agrupa contenedores.",
        responseType: "answer",
        provenance: {
          currentTopicTexts: ["Un Pod agrupa contenedores."],
          courseTexts: [],
          generalTexts: [],
          courseSources: [],
        },
      },
    ];
    render(<TutorConversation messages={messages} showSourceRefs={false} />);
    expect(screen.getByText("Basado en este tema")).toBeInTheDocument();
    expect(screen.getByText("Un Pod agrupa contenedores.")).toBeInTheDocument();
  });

  it("el CTA de tema relacionado tiene un nombre accesible con el título del tema", () => {
    const messages: TutorConversationMessage[] = [
      {
        id: "1",
        role: "assistant",
        content: "Texto de curso.",
        responseType: "answer",
        provenance: {
          currentTopicTexts: [],
          courseTexts: ["Texto de curso."],
          generalTexts: [],
          courseSources: [
            {
              ref: "COURSE-SRC-001",
              module_id: "modulo-x",
              module_title: "Módulo X",
              topic_id: "topico-x",
              topic_title: "Arquitectura de referencia",
              original_source_ref: "SRC-001",
              heading_path: [],
            },
          ],
        },
      },
    ];
    render(<TutorConversation messages={messages} showSourceRefs={false} />);
    const cta = screen.getByRole("button", {
      name: "Ver tema relacionado: Arquitectura de referencia",
    });
    expect(cta.tagName).toBe("BUTTON"); // navegable por teclado por default (Enter/Space)
  });

  it("sin onNavigateToTopic, click en el CTA no rompe (defensivo)", () => {
    const messages: TutorConversationMessage[] = [
      {
        id: "1",
        role: "assistant",
        content: "Texto de curso.",
        responseType: "answer",
        provenance: {
          currentTopicTexts: [],
          courseTexts: ["Texto de curso."],
          generalTexts: [],
          courseSources: [
            {
              ref: "COURSE-SRC-001",
              module_id: "modulo-x",
              module_title: "Módulo X",
              topic_id: "topico-x",
              topic_title: "Tópico X",
              original_source_ref: "SRC-001",
              heading_path: [],
            },
          ],
        },
      },
    ];
    render(<TutorConversation messages={messages} showSourceRefs={false} />);
    expect(() =>
      screen.getByRole("button", { name: "Ver tema relacionado: Tópico X" }).click()
    ).not.toThrow();
  });

  it("ninguna referencia COURSE-SRC-XXX se muestra al alumno como label visible", () => {
    const messages: TutorConversationMessage[] = [
      {
        id: "1",
        role: "assistant",
        content: "Texto de curso.",
        responseType: "answer",
        provenance: {
          currentTopicTexts: [],
          courseTexts: ["Texto de curso."],
          generalTexts: [],
          courseSources: [
            {
              ref: "COURSE-SRC-001",
              module_id: "modulo-x",
              module_title: "Módulo X",
              topic_id: "topico-x",
              topic_title: "Tópico X",
              original_source_ref: "SRC-009",
              heading_path: [],
            },
          ],
        },
      },
    ];
    const { container } = render(<TutorConversation messages={messages} showSourceRefs={false} />);
    expect(container.textContent).not.toMatch(/COURSE-SRC-\d{3}/);
    expect(container.textContent).not.toMatch(/SRC-009/);
  });
});
