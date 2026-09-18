import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuestionPlayer } from "../QuestionPlayer";
import type { ExamQuestionView } from "../../types/api";

const SINGLE_CHOICE: ExamQuestionView = {
  bank_id: "a".repeat(64),
  question_id: "Q-001",
  course_id: "curso-demo",
  module_id: "modulo-demo",
  topic_id: "topico-demo",
  question_type: "single_choice",
  question_style: "conceptual",
  stem: "¿Qué es Kubernetes?",
  options: [
    { option_id: "A", text: "Un orquestador de contenedores." },
    { option_id: "B", text: "Un sistema operativo." },
    { option_id: "C", text: "Una base de datos." },
  ],
};

const MULTIPLE_CHOICE: ExamQuestionView = {
  ...SINGLE_CHOICE,
  question_id: "Q-002",
  question_type: "multiple_choice",
};

describe("QuestionPlayer", () => {
  it("nunca expone correct_option_ids, explanation ni derivation_refs en el DOM", () => {
    const { container } = render(
      <QuestionPlayer
        question={SINGLE_CHOICE}
        index={0}
        total={1}
        selectedOptionIds={[]}
        onChange={vi.fn()}
      />
    );
    expect(container.innerHTML).not.toMatch(/correct_option_ids|derivation_refs|explanation/);
  });

  it("renderiza el stem como texto plano", () => {
    render(
      <QuestionPlayer question={SINGLE_CHOICE} index={0} total={1} selectedOptionIds={[]} onChange={vi.fn()} />
    );
    expect(screen.getByText("¿Qué es Kubernetes?")).toBeInTheDocument();
  });

  it("single_choice usa inputs de tipo radio (una sola opción a la vez)", () => {
    const onChange = vi.fn();
    render(
      <QuestionPlayer
        question={SINGLE_CHOICE}
        index={0}
        total={1}
        selectedOptionIds={["A"]}
        onChange={onChange}
      />
    );
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    fireEvent.click(radios[1]);
    expect(onChange).toHaveBeenCalledWith(["B"]);
  });

  it("multiple_choice usa checkboxes y permite seleccionar varias opciones", () => {
    const onChange = vi.fn();
    render(
      <QuestionPlayer
        question={MULTIPLE_CHOICE}
        index={0}
        total={1}
        selectedOptionIds={["A"]}
        onChange={onChange}
      />
    );
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(3);
    fireEvent.click(checkboxes[2]); // agrega C a la selección existente [A]
    expect(onChange).toHaveBeenCalledWith(["A", "C"]);
  });

  it("multiple_choice deselecciona una opción ya elegida (toggle)", () => {
    const onChange = vi.fn();
    render(
      <QuestionPlayer
        question={MULTIPLE_CHOICE}
        index={0}
        total={1}
        selectedOptionIds={["A", "B"]}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getAllByRole("checkbox")[0]); // deselecciona A
    expect(onChange).toHaveBeenCalledWith(["B"]);
  });

  it("disabled=true bloquea la interacción (pregunta ya corregida)", () => {
    const onChange = vi.fn();
    render(
      <QuestionPlayer
        question={SINGLE_CHOICE}
        index={0}
        total={1}
        selectedOptionIds={["A"]}
        onChange={onChange}
        disabled
      />
    );
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    radios.forEach((radio) => expect(radio).toBeDisabled());
  });

  it("muestra 'Pregunta X de Y'", () => {
    render(
      <QuestionPlayer question={SINGLE_CHOICE} index={2} total={5} selectedOptionIds={[]} onChange={vi.fn()} />
    );
    expect(screen.getByText("Pregunta 3 de 5")).toBeInTheDocument();
  });
});
