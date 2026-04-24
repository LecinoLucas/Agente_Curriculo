import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "../components/layout/AppShell";
import { LoginPage } from "../pages/LoginPage";
import { AnalisesPage } from "../pages/AnalisesPage";
import { CadastroCentralizadoPage } from "../pages/CadastroCentralizadoPage";
import { CandidatosPage } from "../pages/CandidatosPage";
import { CurriculosPage } from "../pages/CurriculosPage";
import { DashboardPage } from "../pages/DashboardPage";
import { SkillsPage } from "../pages/SkillsPage";
import { VagasPage } from "../pages/VagasPage";
import { VagaDetailPage } from "../pages/VagaDetailPage";
import { ProtectedRoute } from "./ProtectedRoute";

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route
          path="dashboard"
          element={
            <ProtectedRoute allowedRoles={["admin", "recruiter", "candidate", "viewer"]}>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="curriculos"
          element={
            <ProtectedRoute allowedRoles={["admin", "recruiter", "candidate"]}>
              <CurriculosPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="analises"
          element={
            <ProtectedRoute allowedRoles={["admin", "recruiter", "candidate", "viewer"]}>
              <AnalisesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="candidatos"
          element={
            <ProtectedRoute allowedRoles={["admin", "recruiter"]}>
              <CandidatosPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="vagas"
          element={
            <ProtectedRoute allowedRoles={["admin", "recruiter", "viewer"]}>
              <VagasPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="vagas/:id"
          element={
            <ProtectedRoute allowedRoles={["admin", "recruiter"]}>
              <VagaDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="skills"
          element={
            <ProtectedRoute allowedRoles={["admin", "recruiter"]}>
              <SkillsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="cadastros"
          element={
            <ProtectedRoute allowedRoles={["admin", "recruiter"]}>
              <CadastroCentralizadoPage />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
