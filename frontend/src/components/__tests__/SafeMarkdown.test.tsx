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
    // v1.6.1: el path completo se codifica como un único segmento
    // percent-encoded (ver `client.test.ts`), así que el "/" interno de
    // "images/architecture.png" llega como "%2F" en la URL -- el browser
    // real lo decodifica de vuelta al pedir el recurso.
    const src = img?.getAttribute("src") ?? "";
    expect(src).toContain("/api/courses/curso-demo/modules/modulo-demo/topics/topico-demo/assets/");
    expect(decodeURIComponent(src.split("/assets/")[1])).toBe("images/architecture.png");
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

  it("NUNCA carga automáticamente una imagen data: NI la ofrece como link clicable", () => {
    // Fase 8, sección 15/16: react-markdown (defaultUrlTransform) ya
    // sanea `src`/`href` a "" para cualquier esquema fuera de
    // https?/ircs?/mailto/xmpp ANTES de que nuestros renderers custom se
    // ejecuten, así que un `data:` nunca llega como string no vacío acá
    // (el <img> no se renderiza en absoluto). El componente además nunca
    // ofrece un link clicable para lo que sí llegara a detectar como
    // "imagen externa" con un esquema no http(s) (defensa en profundidad,
    // ver isSafeLinkHref en la rama img()).
    const { container } = render(
      <SafeMarkdown markdown="![Data](data:image/png;base64,AAAA)" {...IDS} />
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
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

  // v1.6.1: Rich Markdown Rendering -- fenced code blocks con etiqueta de
  // lenguaje (CSS, sin librería de syntax highlighting nueva, ver
  // docs/RICH_MARKDOWN_RENDERING_V1_6_1.md).
  it("un fenced code block con lenguaje muestra la etiqueta y preserva estructura pre>code", () => {
    const { container } = render(
      <SafeMarkdown markdown={"```python\ndef foo():\n    return True\n```"} {...IDS} />
    );
    expect(screen.getByText("python")).toHaveClass("safe-markdown__code-lang");
    const pre = container.querySelector("pre");
    expect(pre).not.toBeNull();
    const code = pre?.querySelector("code");
    expect(code).not.toBeNull();
    expect(code?.className).toContain("language-python");
    // whitespace/indentación preservados (nunca colapsados a una línea).
    expect(code?.textContent).toBe("def foo():\n    return True\n");
  });

  it("un fenced code block SIN lenguaje declarado no muestra etiqueta pero sigue siendo pre>code", () => {
    const { container } = render(<SafeMarkdown markdown={"```\nplain text\n```"} {...IDS} />);
    expect(container.querySelector(".safe-markdown__code-lang")).toBeNull();
    expect(container.querySelector("pre > code")).not.toBeNull();
  });

  it("inline code nunca queda envuelto en un <pre> (se distingue de un fenced block)", () => {
    const { container } = render(<SafeMarkdown markdown={"Usá `foo()` acá."} {...IDS} />);
    expect(container.querySelector("pre")).toBeNull();
    expect(container.querySelector("code")?.textContent).toBe("foo()");
  });

  it("nunca inyecta HTML dentro de un code block (el código se muestra como texto plano)", () => {
    const { container } = render(
      <SafeMarkdown markdown={"```html\n<script>alert(1)</script>\n```"} {...IDS} />
    );
    expect(container.querySelector("pre script")).toBeNull();
    expect(container.querySelector("pre code")?.textContent).toContain("<script>alert(1)</script>");
  });

  it("una tabla GFM se renderiza con estructura semántica real (table/thead/tbody)", () => {
    const { container } = render(
      <SafeMarkdown
        markdown={"| Modelo | Uso |\n| --- | --- |\n| Haiku | Rápido |\n"}
        {...IDS}
      />
    );
    expect(container.querySelector("table")).not.toBeNull();
    expect(container.querySelector("thead th")?.textContent).toBe("Modelo");
    expect(container.querySelector("tbody td")?.textContent).toBe("Haiku");
  });

  it("un blockquote se renderiza como <blockquote>", () => {
    const { container } = render(<SafeMarkdown markdown={"> Una cita del material."} {...IDS} />);
    expect(container.querySelector("blockquote")).not.toBeNull();
  });
});
