import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { PipelineProvider } from "../features/pipeline/PipelineContext";

import { AppShell } from "../components/layout/AppShell";
import { ProtectedRoute } from "./ProtectedRoute";

const LoginPage = lazy(() => import("../pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const VagasPage = lazy(() => import("../pages/VagasPage").then((m) => ({ default: m.VagasPage })));
const PipelinePage = lazy(() => import("../pages/PipelinePage").then((m) => ({ default: m.PipelinePage })));
const ProfilePage = lazy(() => import("../pages/ProfilePage").then((m) => ({ default: m.ProfilePage })));
const CandidatesPage = lazy(() => import("../pages/CandidatesPage").then((m) => ({ default: m.CandidatesPage })));
const AdminPage = lazy(() => import("../pages/AdminPage").then((m) => ({ default: m.AdminPage })));
const UsersPage = lazy(() => import("../pages/UsersPage").then((m) => ({ default: m.UsersPage })));
const AnalisesIaPage = lazy(() => import("../pages/AnalisesIaPage").then((m) => ({ default: m.AnalisesIaPage })));

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
              <PipelineProvider>
                <AppShell />
              </PipelineProvider>
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/pipeline" replace />} />

          <Route
            path="pipeline"
            element={
              <ProtectedRoute allowedRoles={["admin", "recruiter", "viewer"]}>
                <PipelinePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="pipeline/:jobId"
            element={
              <ProtectedRoute allowedRoles={["admin", "recruiter", "viewer"]}>
                <PipelinePage />
              </ProtectedRoute>
            }
          />

          <Route
            path="candidatos"
            element={
              <ProtectedRoute allowedRoles={["admin", "recruiter", "viewer"]}>
                <CandidatesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="analises-ia"
            element={
              <ProtectedRoute allowedRoles={["admin", "recruiter"]}>
                <AnalisesIaPage />
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
            path="perfil"
            element={
              <ProtectedRoute allowedRoles={["admin", "recruiter", "candidate", "viewer"]}>
                <ProfilePage />
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
