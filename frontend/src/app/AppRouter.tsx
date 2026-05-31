import { lazy, Suspense, ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "../components/layout/AppShell";
import { PipelineProvider } from "../features/pipeline/PipelineContext";
import { ProtectedRoute } from "./ProtectedRoute";
import { PublicRouteThemeGuard } from "./PublicRouteThemeGuard";
import { CandidateThemeGuard } from "./CandidateThemeGuard";

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

const CandidateProfilePage = lazy(() =>
  import("../pages/CandidateProfilePage").then((m) => ({ default: m.CandidateProfilePage }))
);

const AdmissionCasePage = lazy(() =>
  import("../pages/AdmissionCasePage").then((m) => ({ default: m.AdmissionCasePage }))
);

const AdmitidosPage = lazy(() =>
  import("../pages/AdmitidosPage").then((m) => ({ default: m.AdmitidosPage }))
);

const AdmissionIntegrationPlaceholderPage = lazy(() =>
  import("../pages/AdmissionIntegrationPlaceholderPage").then((m) => ({
    default: m.AdmissionIntegrationPlaceholderPage,
  }))
);

const PreAdmissionChecklistsPage = lazy(() =>
  import("../pages/PreAdmissionChecklistsPage").then((m) => ({
    default: m.PreAdmissionChecklistsPage,
  }))
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


const CadastrosPage = lazy(() =>
  import("../pages/CadastrosPage").then((m) => ({ default: m.CadastrosPage }))
);

const AuditLogsPage = lazy(() =>
  import("../pages/AuditLogsPage").then((m) => ({ default: m.AuditLogsPage }))
);

const SystemHealthPage = lazy(() =>
  import("../pages/SystemHealthPage").then((m) => ({ default: m.SystemHealthPage }))
);

const AdminAiProviderCredentialsPage = lazy(() =>
  import("../pages/AdminAiProviderCredentialsPage").then((m) => ({
    default: m.AdminAiProviderCredentialsPage,
  }))
);

const AdminBiPage = lazy(() =>
  import("../pages/AdminBiPage").then((m) => ({ default: m.AdminBiPage }))
);

const BehavioralTemplatesPage = lazy(() =>
  import("../pages/BehavioralTemplatesPage").then((m) => ({
    default: m.BehavioralTemplatesPage,
  }))
);

const BehavioralTemplateEditorPage = lazy(() =>
  import("../pages/BehavioralTemplateEditorPage").then((m) => ({
    default: m.BehavioralTemplateEditorPage,
  }))
);

const DemoRhPage = lazy(() =>
  import("../pages/DemoRhPage").then((m) => ({ default: m.DemoRhPage }))
);

const AnalisesIaPage = lazy(() =>
  import("../pages/AnalisesIaPage").then((m) => ({
    default: m.AnalisesIaPage,
  }))
);

const AnalisesIaComportamentalPage = lazy(() =>
  import("../pages/AnalisesIaComportamentalPage").then((m) => ({
    default: m.AnalisesIaComportamentalPage,
  }))
);

const CandidaturasPage = lazy(() =>
  import("../pages/CandidaturasPage").then((m) => ({ default: m.CandidaturasPage }))
);

const RhDashboardPage = lazy(() =>
  import("../pages/RhDashboardPage").then((m) => ({ default: m.RhDashboardPage }))
);

const DashboardPage = lazy(() =>
  import("../pages/DashboardPage").then((m) => ({ default: m.DashboardPage }))
);

const AgendaPage = lazy(() =>
  import("../pages/AgendaPage").then((m) => ({ default: m.AgendaPage }))
);

const ImportPage = lazy(() =>
  import("../pages/ImportPage").then((m) => ({ default: m.ImportPage }))
);

const GoogleImportPage = lazy(() =>
  import("../pages/GoogleImportPage").then((m) => ({ default: m.GoogleImportPage }))
);

const ChangePasswordPage = lazy(() =>
  import("../pages/ChangePasswordPage").then((m) => ({
    default: m.ChangePasswordPage,
  }))
);

const CandidatePortalPage = lazy(() =>
  import("../pages/CandidatePortalPage").then((m) => ({
    default: m.CandidatePortalPage,
  }))
);

const CandidatePreAdmissionPage = lazy(() =>
  import("../pages/CandidatePreAdmissionPage").then((m) => ({
    default: m.CandidatePreAdmissionPage,
  }))
);

const CandidateEntryPage = lazy(() =>
  import("../pages/CandidateEntryPage").then((m) => ({
    default: m.CandidateEntryPage,
  }))
);

const PublicApplicationPage = lazy(() =>
  import("../pages/PublicApplicationPage").then((m) => ({
    default: m.PublicApplicationPage,
  }))
);

const ManagerReviewPage = lazy(() =>
  import("../pages/ManagerReviewPage").then((m) => ({
    default: m.ManagerReviewPage,
  }))
);

type UserRole = "admin" | "recruiter" | "candidate" | "viewer" | "manager" | "hr";

const STAFF_ROLES: UserRole[] = ["admin", "recruiter", "viewer", "manager", "hr"];
const RH_ROLES: UserRole[] = ["admin", "recruiter", "viewer", "manager", "hr"];
const AGENDA_ROLES: UserRole[] = ["admin", "recruiter", "viewer", "hr"];
const ADMIN_ROLES: UserRole[] = ["admin"];
const DEMO_RH_ROLES: UserRole[] = ["admin", "recruiter"];
const PRE_ADMISSION_ROLES: UserRole[] = ["admin", "hr"];
const MANAGER_ROLES: UserRole[] = ["admin", "manager"];
const ALL_AUTH_ROLES: UserRole[] = ["admin", "recruiter", "candidate", "viewer", "manager", "hr"];

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

function publicPage(element: ReactNode) {
  return (
    <PublicRouteThemeGuard>
      {withSuspense(element)}
    </PublicRouteThemeGuard>
  );
}

function candidatePage(element: ReactNode) {
  return (
    <CandidateThemeGuard>
      {withSuspense(element)}
    </CandidateThemeGuard>
  );
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/candidato" element={publicPage(<CandidateEntryPage />)} />
      <Route path="/candidato/cadastro" element={publicPage(<PublicApplicationPage />)} />
      <Route path="/candidato/login" element={publicPage(<CandidateEntryPage />)} />
      <Route path="/candidato/portal" element={candidatePage(<CandidatePortalPage />)} />
      <Route
        path="/candidato/pre-admissao"
        element={candidatePage(<CandidatePreAdmissionPage />)}
      />
      <Route path="/login" element={publicPage(<LoginPage />)} />

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
        <Route index element={<Navigate to="/rh" replace />} />

        <Route
          path="dashboard"
          element={<Navigate to="/rh" replace />}
        />

        <Route
          path="rh"
          element={protectedPage(<RhDashboardPage />, RH_ROLES)}
        />

        <Route
          path="agenda"
          element={protectedPage(<AgendaPage />, AGENDA_ROLES)}
        />

        <Route
          path="pipeline"
          element={protectedPage(<PipelinePage />, STAFF_ROLES)}
        />

        <Route
          path="pipeline/:jobId"
          element={protectedPage(<PipelinePage />, STAFF_ROLES)}
        />

        <Route
          path="candidaturas"
          element={protectedPage(<CandidaturasPage />, STAFF_ROLES)}
        />

        <Route
          path="candidatos"
          element={protectedPage(<CandidatesPage />, STAFF_ROLES)}
        />

        <Route
          path="candidatos/:candidateId"
          element={protectedPage(<CandidateProfilePage />, STAFF_ROLES)}
        />

        <Route
          path="admission/cases/:caseId"
          element={protectedPage(<AdmissionCasePage />, PRE_ADMISSION_ROLES)}
        />

        <Route
          path="admission/cases/:caseId/integration"
          element={protectedPage(<AdmissionIntegrationPlaceholderPage />, PRE_ADMISSION_ROLES)}
        />

        <Route
          path="admissao/:caseId"
          element={protectedPage(<AdmissionCasePage />, PRE_ADMISSION_ROLES)}
        />

        <Route
          path="admissao/:caseId/integracao"
          element={protectedPage(<AdmissionIntegrationPlaceholderPage />, PRE_ADMISSION_ROLES)}
        />

        <Route
          path="admissao/checklists"
          element={protectedPage(<PreAdmissionChecklistsPage />, PRE_ADMISSION_ROLES)}
        />

        <Route
          path="admitidos"
          element={protectedPage(<AdmitidosPage />, PRE_ADMISSION_ROLES)}
        />

        <Route
          path="vagas"
          element={protectedPage(<VagasPage />, STAFF_ROLES)}
        />

        <Route
          path="importar"
          element={protectedPage(<ImportPage />, ["admin", "recruiter"])}
        />

        <Route
          path="importar-formulario"
          element={protectedPage(<GoogleImportPage />, ["admin", "recruiter"])}
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
          path="analises-ia/comportamental"
          element={protectedPage(<AnalisesIaComportamentalPage />, ["admin", "recruiter"])}
        />

        <Route
          path="manager"
          element={protectedPage(<ManagerReviewPage />, MANAGER_ROLES)}
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
          element={<Navigate to="/admin/cadastros" replace />}
        />

        <Route
          path="admin/cadastros"
          element={protectedPage(<CadastrosPage />, ADMIN_ROLES)}
        />

        <Route
          path="admin/auditoria"
          element={protectedPage(<AuditLogsPage />, ADMIN_ROLES)}
        />

        <Route
          path="admin/health"
          element={protectedPage(<SystemHealthPage />, ADMIN_ROLES)}
        />

        <Route
          path="admin/ai-provider-credentials"
          element={protectedPage(<AdminAiProviderCredentialsPage />, ADMIN_ROLES)}
        />

        <Route
          path="admin/bi"
          element={protectedPage(<AdminBiPage />, ADMIN_ROLES)}
        />

        <Route
          path="admin/behavioral-templates"
          element={protectedPage(<BehavioralTemplatesPage />, ["admin", "recruiter"])}
        />

        <Route
          path="admin/behavioral-templates/:templateId/edit"
          element={protectedPage(<BehavioralTemplateEditorPage />, ["admin", "recruiter"])}
        />

        <Route
          path="demo-rh"
          element={protectedPage(<DemoRhPage />, DEMO_RH_ROLES)}
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
