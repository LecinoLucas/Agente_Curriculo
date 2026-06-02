import { lazy, Suspense, ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "../components/layout/AppShell";
import { PipelineProvider } from "../features/pipeline/PipelineContext";
import {
  ADMIN_ONLY_ROLES,
  AGENDA_ACCESS_ROLES,
  ALL_AUTH_ROLES,
  ANALYSIS_ROLES,
  CANDIDATES_ACCESS_ROLES,
  INTERNAL_STAFF_ROLES,
  JOB_MANAGEMENT_ROLES,
  MANAGER_AREA_ROLES,
  OPERATIONAL_MASTER_ROLES,
  PRE_ADMISSION_AREA_ROLES,
  RH_DASHBOARD_ROLES,
  STAFF_ROLES,
} from "../shared/auth/roles";
import type { UserRole } from "../types/auth";
import { ProtectedRoute } from "./ProtectedRoute";
import { PublicRouteThemeGuard } from "./PublicRouteThemeGuard";

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

const EstruturaOperacionalPage = lazy(() =>
  import("../pages/EstruturaOperacionalPage").then((m) => ({
    default: m.EstruturaOperacionalPage,
  }))
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

const ManagerReviewPage = lazy(() =>
  import("../pages/ManagerReviewPage").then((m) => ({
    default: m.ManagerReviewPage,
  }))
);

const CandidatePortalRedirectPage = lazy(() =>
  import("../pages/CandidatePortalRedirectPage").then((m) => ({
    default: m.CandidatePortalRedirectPage,
  }))
);

const AssistantAdminPage = lazy(() =>
  import("../pages/AssistantAdminPage").then((m) => ({
    default: m.AssistantAdminPage,
  }))
);

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

export function AppRouter() {
  return (
    <Routes>
      {/* /candidato/* → transition screen pointing to the new standalone portal */}
      <Route path="/candidato" element={publicPage(<CandidatePortalRedirectPage />)} />
      <Route path="/candidato/cadastro" element={publicPage(<CandidatePortalRedirectPage />)} />
      <Route path="/candidato/login" element={publicPage(<CandidatePortalRedirectPage />)} />
      <Route path="/candidato/portal" element={publicPage(<CandidatePortalRedirectPage />)} />
      <Route
        path="/candidato/pre-admissao"
        element={publicPage(<CandidatePortalRedirectPage />)}
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
          element={protectedPage(<RhDashboardPage />, RH_DASHBOARD_ROLES)}
        />

        <Route
          path="agenda"
          element={protectedPage(<AgendaPage />, AGENDA_ACCESS_ROLES)}
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
          element={protectedPage(<CandidatesPage />, CANDIDATES_ACCESS_ROLES)}
        />

        <Route
          path="candidatos/:candidateId"
          element={protectedPage(<CandidateProfilePage />, CANDIDATES_ACCESS_ROLES)}
        />

        <Route
          path="admission/cases/:caseId"
          element={protectedPage(<AdmissionCasePage />, PRE_ADMISSION_AREA_ROLES)}
        />

        <Route
          path="admission/cases/:caseId/integration"
          element={protectedPage(<AdmissionIntegrationPlaceholderPage />, PRE_ADMISSION_AREA_ROLES)}
        />

        <Route
          path="admissao/:caseId"
          element={protectedPage(<AdmissionCasePage />, PRE_ADMISSION_AREA_ROLES)}
        />

        <Route
          path="admissao/:caseId/integracao"
          element={protectedPage(<AdmissionIntegrationPlaceholderPage />, PRE_ADMISSION_AREA_ROLES)}
        />

        <Route
          path="admissao/checklists"
          element={protectedPage(<PreAdmissionChecklistsPage />, PRE_ADMISSION_AREA_ROLES)}
        />

        <Route
          path="admitidos"
          element={protectedPage(<AdmitidosPage />, PRE_ADMISSION_AREA_ROLES)}
        />

        <Route
          path="vagas"
          element={protectedPage(<VagasPage />, STAFF_ROLES)}
        />

        <Route
          path="importar"
          element={protectedPage(<ImportPage />, JOB_MANAGEMENT_ROLES)}
        />

        <Route
          path="importar-formulario"
          element={protectedPage(<GoogleImportPage />, JOB_MANAGEMENT_ROLES)}
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
          element={protectedPage(<AnalisesIaPage />, ANALYSIS_ROLES)}
        />

        <Route
          path="analises-ia/comportamental"
          element={protectedPage(<AnalisesIaComportamentalPage />, ANALYSIS_ROLES)}
        />

        <Route
          path="manager"
          element={protectedPage(<ManagerReviewPage />, MANAGER_AREA_ROLES)}
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
          element={protectedPage(<AdminPage />, ADMIN_ONLY_ROLES)}
        />

        <Route
          path="admin/estrutura-operacional"
          element={protectedPage(<EstruturaOperacionalPage />, OPERATIONAL_MASTER_ROLES)}
        />

        <Route
          path="admin/usuarios"
          element={protectedPage(<UsersPage />, ADMIN_ONLY_ROLES)}
        />

        <Route
          path="admin/skills"
          element={<Navigate to="/admin/cadastros" replace />}
        />

        <Route
          path="admin/cadastros"
          element={protectedPage(<CadastrosPage />, ADMIN_ONLY_ROLES)}
        />

        <Route
          path="admin/auditoria"
          element={protectedPage(<AuditLogsPage />, ADMIN_ONLY_ROLES)}
        />

        <Route
          path="admin/health"
          element={protectedPage(<SystemHealthPage />, ADMIN_ONLY_ROLES)}
        />

        <Route
          path="admin/ai-provider-credentials"
          element={protectedPage(<AdminAiProviderCredentialsPage />, ADMIN_ONLY_ROLES)}
        />

        <Route
          path="admin/bi"
          element={protectedPage(<AdminBiPage />, ADMIN_ONLY_ROLES)}
        />

        <Route
          path="admin/behavioral-templates"
          element={protectedPage(<BehavioralTemplatesPage />, JOB_MANAGEMENT_ROLES)}
        />

        <Route
          path="admin/behavioral-templates/:templateId/edit"
          element={protectedPage(<BehavioralTemplateEditorPage />, JOB_MANAGEMENT_ROLES)}
        />

        <Route
          path="admin/assistente-candidato"
          element={protectedPage(
            <AssistantAdminPage />,
            INTERNAL_STAFF_ROLES
          )}
        />

        <Route
          path="demo-rh"
          element={protectedPage(<DemoRhPage />, JOB_MANAGEMENT_ROLES)}
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
