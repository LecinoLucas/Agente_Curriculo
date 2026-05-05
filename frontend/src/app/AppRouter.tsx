import { lazy, Suspense, ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "../components/layout/AppShell";
import { PipelineProvider } from "../features/pipeline/PipelineContext";
import { ProtectedRoute } from "./ProtectedRoute";

const LoginPage = lazy(() =>
  import("../pages/LoginPage").then((m) => ({ default: m.LoginPage }))
);

const PipelinePage = lazy(() =>
  import("../pages/PipelinePage").then((m) => ({ default: m.PipelinePage }))
);

const ProfilePage = lazy(() =>
  import("../pages/ProfilePage").then((m) => ({ default: m.ProfilePage }))
);

const CandidatesPage = lazy(() =>
  import("../pages/CandidatesPage").then((m) => ({ default: m.CandidatesPage }))
);

const VagasPage = lazy(() =>
  import("../pages/VagasPage").then((m) => ({ default: m.VagasPage }))
);

const JobFormPage = lazy(() =>
  import("../pages/JobFormPage").then((m) => ({ default: m.JobFormPage }))
);

const AdminPage = lazy(() =>
  import("../pages/AdminPage").then((m) => ({ default: m.AdminPage }))
);

const UsersPage = lazy(() =>
  import("../pages/UsersPage").then((m) => ({ default: m.UsersPage }))
);

const SkillsPage = lazy(() =>
  import("../pages/SkillsPage").then((m) => ({ default: m.SkillsPage }))
);

const AnalisesIaPage = lazy(() =>
  import("../pages/AnalisesIaPage").then((m) => ({
    default: m.AnalisesIaPage,
  }))
);

const ChangePasswordPage = lazy(() =>
  import("../pages/ChangePasswordPage").then((m) => ({
    default: m.ChangePasswordPage,
  }))
);

type UserRole = "admin" | "recruiter" | "candidate" | "viewer";

const STAFF_ROLES: UserRole[] = ["admin", "recruiter", "viewer"];
const ADMIN_ROLES: UserRole[] = ["admin"];
const ALL_AUTH_ROLES: UserRole[] = ["admin", "recruiter", "candidate", "viewer"];

function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-sm text-gray-500">
      Carregando...
    </div>
  );
}

function withSuspense(element: ReactNode) {
  return <Suspense fallback={<PageLoader />}>{element}</Suspense>;
}

function protectedPage(element: ReactNode, roles?: UserRole[]) {
  return (
    <ProtectedRoute allowedRoles={roles}>
      {withSuspense(element)}
    </ProtectedRoute>
  );
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={withSuspense(<LoginPage />)} />

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
          element={protectedPage(<PipelinePage />, STAFF_ROLES)}
        />

        <Route
          path="pipeline/:jobId"
          element={protectedPage(<PipelinePage />, STAFF_ROLES)}
        />

        <Route
          path="candidatos"
          element={protectedPage(<CandidatesPage />, STAFF_ROLES)}
        />

        <Route
          path="vagas"
          element={protectedPage(<VagasPage />, STAFF_ROLES)}
        />

        <Route
          path="vagas/nova"
          element={protectedPage(<JobFormPage />, STAFF_ROLES)}
        />

        <Route
          path="vagas/:jobId/editar"
          element={protectedPage(<JobFormPage />, STAFF_ROLES)}
        />

        <Route
          path="analises-ia"
          element={protectedPage(<AnalisesIaPage />, ["admin", "recruiter"])}
        />

        <Route
          path="perfil"
          element={protectedPage(<ProfilePage />, ALL_AUTH_ROLES)}
        />

        <Route
          path="trocar-senha"
          element={protectedPage(<ChangePasswordPage />, ALL_AUTH_ROLES)}
        />

        <Route
          path="admin"
          element={protectedPage(<AdminPage />, ADMIN_ROLES)}
        />

        <Route
          path="admin/usuarios"
          element={protectedPage(<UsersPage />, ADMIN_ROLES)}
        />

        <Route
          path="admin/skills"
          element={protectedPage(<SkillsPage />, ADMIN_ROLES)}
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
