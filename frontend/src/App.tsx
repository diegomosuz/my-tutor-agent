import { Navigate, Route, Routes } from "react-router-dom";
import { AppHeader } from "./components/AppHeader";
import { CatalogPage } from "./pages/CatalogPage";
import { CourseDetailPage } from "./pages/CourseDetailPage";
import { ClassroomPage } from "./pages/ClassroomPage";
import { AulaLandingPage } from "./pages/AulaLandingPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";

export function App() {
  return (
    <div className="app-shell">
      <AppHeader />
      <Routes>
        <Route path="/" element={<CatalogPage />} />
        <Route path="/cursos/:courseId" element={<CourseDetailPage />} />
        <Route path="/aula" element={<AulaLandingPage />} />
        <Route
          path="/aula/:courseId/:moduleId/:topicId"
          element={<ClassroomPage />}
        />
        <Route
          path="/mi-aprendizaje"
          element={
            <PlaceholderPage
              title="Mi aprendizaje"
              description="Acá vas a poder ver tu progreso guardado localmente en cada curso."
            />
          }
        />
        <Route
          path="/recursos"
          element={
            <PlaceholderPage
              title="Recursos"
              description="Materiales complementarios y enlaces útiles para tus cursos."
            />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
