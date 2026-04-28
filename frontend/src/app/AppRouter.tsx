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

/**
 * App Router with User-Candidate Boundary
 *
 * See: docs/user-candidate-boundary.md
 *
 * Route Access Rules:
 * ───────────────────
 * - Internal routes (pipeline, admin, vagas, etc): ADMIN/RECRUITER/VIEWER only
 * - Profile route (/perfil): All authenticated users (including role="candidate")
 * - role="candidate" is NOT an internal user; it's a portal access marker
 *
 * Future Portal Candidates:
 *   Phase 20.3+ will add /candidate-portal/* routes
 */
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

          {/* INTERNAL ROUTES: Blocked for role="candidate" */}

          <Route
            path="pipeline"
            element={
              <ProtectedRoute allowedRoles={["admin", "recruiter", "viewer"]}>
                {/* role="candidate" BLOCKED: No portal access yet */}
                <PipelinePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="pipeline/:jobId"
            element={
              <ProtectedRoute allowedRoles={["admin", "recruiter", "viewer"]}>
                {/* role="candidate" BLOCKED: No portal access yet */}
                <PipelinePage />
              </ProtectedRoute>
            }
          />

          <Route
            path="candidatos"
            element={
              <ProtectedRoute allowedRoles={["admin", "recruiter", "viewer"]}>
                {/* role="candidate" BLOCKED: Candidates are managed by recruiters */}
                <CandidatesPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="analises-ia"
            element={
              <ProtectedRoute allowedRoles={["admin", "recruiter"]}>
                {/* role="candidate" BLOCKED: AI analysis is recruiter-only */}
                <AnalisesIaPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="vagas"
            element={
              <ProtectedRoute allowedRoles={["admin", "recruiter", "viewer"]}>
                {/* role="candidate" BLOCKED: Jobs are internal catalog */}
                <VagasPage />
              </ProtectedRoute>
            }
          />

          {/* PORTAL ROUTES: Accessible to all authenticated users */}

          <Route
            path="perfil"
            element={
              <ProtectedRoute allowedRoles={["admin", "recruiter", "candidate", "viewer"]}>
                {/* role="candidate" ALLOWED: Edit own user profile */}
                <ProfilePage />
              </ProtectedRoute>
            }
          />

          {/* ADMIN ROUTES: Admin only */}

          <Route
            path="admin"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                {/* role="candidate" BLOCKED: Admin panel */}
                <AdminPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin/usuarios"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                {/* role="candidate" BLOCKED: User management */}
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
