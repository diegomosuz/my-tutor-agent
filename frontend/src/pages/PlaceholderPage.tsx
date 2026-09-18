export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header__eyebrow">Próximamente</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="state-box">
        <h3>Esta sección se construirá en una fase posterior</h3>
        <p>La Fase 1 se enfoca en el catálogo de cursos y el aula virtual básica.</p>
      </div>
    </div>
  );
}
