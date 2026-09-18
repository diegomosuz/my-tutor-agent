import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SafeMarkdown } from "../SafeMarkdown";

const IDS = { courseId: "curso-demo", moduleId: "modulo-demo", topicId: "topico-demo" };

describe("SafeMarkdown", () => {
  it("renderiza texto Markdown normal", () => {
    render(<SafeMarkdown markdown={"# Título\n\nPárrafo."} {...IDS} />);
    expect(screen.getByText("Título")).toBeInTheDocument();
    expect(screen.getByText("Párrafo.")).toBeInTheDocument();
  });

  it("transforma una imagen relativa al endpoint seguro de assets", () => {
    const { container } = render(
      <SafeMarkdown markdown="![Arquitectura](images/architecture.png)" {...IDS} />
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toContain(
      "/api/courses/curso-demo/modules/modulo-demo/topics/topico-demo/assets/images/architecture.png"
    );
  });

  it("NUNCA carga automáticamente una imagen externa http(s)", () => {
    const { container } = render(
      <SafeMarkdown markdown="![Externa](https://example.com/image.png)" {...IDS} />
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText(/Imagen externa no cargada automáticamente/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Externa" });
    expect(link).toHaveAttribute("href", "https://example.com/image.png");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("NUNCA carga automáticamente una imagen data:", () => {
    const { container } = render(
      <SafeMarkdown markdown="![Data](data:image/png;base64,AAAA)" {...IDS} />
    );
    expect(container.querySelector("img")).toBeNull();
  });

  it("links http/https usan target=_blank y rel=noopener noreferrer", () => {
    render(<SafeMarkdown markdown="[PwC](https://www.pwc.com)" {...IDS} />);
    const link = screen.getByRole("link", { name: "PwC" });
    expect(link).toHaveAttribute("href", "https://www.pwc.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("bloquea el esquema javascript: (nunca se renderiza como link clicable)", () => {
    render(<SafeMarkdown markdown="[Click](javascript:alert(1))" {...IDS} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Click")).toBeInTheDocument();
  });

  it("bloquea el esquema data: en links", () => {
    render(<SafeMarkdown markdown="[Click](data:text/html,<script>alert(1)</script>)" {...IDS} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("bloquea el esquema file:", () => {
    render(<SafeMarkdown markdown="[Click](file:///etc/passwd)" {...IDS} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("nunca interpreta HTML crudo embebido en el Markdown", () => {
    const { container } = render(
      <SafeMarkdown markdown={"Texto <script>alert(1)</script> normal"} {...IDS} />
    );
    expect(container.querySelector("script")).toBeNull();
  });
});
