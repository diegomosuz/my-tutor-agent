import { Route, Routes } from "react-router-dom";
import { AppHeader } from "./components/AppHeader";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { CatalogPage } from "./pages/CatalogPage";
import { CourseDetailPage } from "./pages/CourseDetailPage";
import { ClassroomPage } from "./pages/ClassroomPage";
import { AulaLandingPage } from "./pages/AulaLandingPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { SettingsPage } from "./pages/SettingsPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { CertificationSetupPage } from "./pages/CertificationSetupPage";
import { CertificationPracticePage } from "./pages/CertificationPracticePage";
import { CertificationSimulationPage } from "./pages/CertificationSimulationPage";
import { CertificationResultsPage } from "./pages/CertificationResultsPage";
import { LearningProgressPage } from "./pages/LearningProgressPage";

export function App() {
  return (
    <ErrorBoundary>
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
          <Route path="/certificacion/:courseId" element={<CertificationSetupPage />} />
          <Route
            path="/certificacion/:courseId/practica"
            element={<CertificationPracticePage />}
          />
          <Route
            path="/certificacion/:courseId/simulacro"
            element={<CertificationSimulationPage />}
          />
          <Route
            path="/certificacion/:courseId/resultados"
            element={<CertificationResultsPage />}
          />
          <Route path="/mi-aprendizaje" element={<LearningProgressPage />} />
          <Route
            path="/recursos"
            element={
              <PlaceholderPage
                title="Recursos"
                description="Materiales complementarios y enlaces útiles para tus cursos."
              />
            }
          />
          <Route path="/configuracion" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </div>
    </ErrorBoundary>
  );
}
