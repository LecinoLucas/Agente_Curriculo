import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "../components/layout/AppShell";
import { ProtectedRoute } from "./ProtectedRoute";

const LoginPage = lazy(() => import("../pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const DashboardPage = lazy(() => import("../pages/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const CurriculosPage = lazy(() => import("../pages/CurriculosPage").then((m) => ({ default: m.CurriculosPage })));
const AnalisesPage = lazy(() => import("../pages/AnalisesPage").then((m) => ({ default: m.AnalisesPage })));
const CandidatosPage = lazy(() => import("../pages/CandidatosPage").then((m) => ({ default: m.CandidatosPage })));
const VagasPage = lazy(() => import("../pages/VagasPage").then((m) => ({ default: m.VagasPage })));
const VagaDetailPage = lazy(() => import("../pages/VagaDetailPage").then((m) => ({ default: m.VagaDetailPage })));
const RankingPage = lazy(() => import("../pages/RankingPage").then((m) => ({ default: m.RankingPage })));
const SkillsPage = lazy(() => import("../pages/SkillsPage").then((m) => ({ default: m.SkillsPage })));
const CadastroCentralizadoPage = lazy(() =>
  import("../pages/CadastroCentralizadoPage").then((m) => ({ default: m.CadastroCentralizadoPage }))
);
const AdminPage = lazy(() => import("../pages/AdminPage").then((m) => ({ default: m.AdminPage })));
const UsersPage = lazy(() => import("../pages/UsersPage").then((m) => ({ default: m.UsersPage })));

function RouteFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-sm text-gray-500">
      Carregando tela...
    </div>
  );
}

export function AppRouter() {
  return (
    <Suspense fallback={<RouteFallback />}>
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
            path="ranking"
            element={
              <ProtectedRoute allowedRoles={["admin", "recruiter", "viewer"]}>
                <RankingPage />
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
          <Route
            path="admin"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <AdminPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin/usuarios"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <UsersPage />
              </ProtectedRoute>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
