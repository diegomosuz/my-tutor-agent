import { NavLink } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/mi-aprendizaje", label: "Mi aprendizaje" },
  { to: "/", label: "Catálogo", end: true },
  { to: "/aula", label: "Aula Virtual" },
  { to: "/recursos", label: "Recursos" },
  { to: "/configuracion", label: "Configuración" },
];

export function AppHeader() {
  return (
    <header className="app-header">
      <div className="app-header__brand">
        <span className="app-header__logo" aria-hidden="true" />
        <span>
          PwC AI Tutor <span className="app-header__brand-sub">| Aula virtual</span>
        </span>
      </div>

      <nav className="app-header__nav" aria-label="Navegación principal">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => (isActive ? "active" : undefined)}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="app-header__profile" role="button" tabIndex={0}>
        <span className="app-header__avatar">AL</span>
        <span className="app-header__profile-name">Mi cuenta</span>
      </div>
    </header>
  );
}
