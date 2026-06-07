import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, BarChart3, BrainCircuit, CheckCircle2, ClipboardList, FileSearch, FileSpreadsheet, FlaskConical, HeartPulse, KeyRound, MapPinned, ShieldCheck, Tags, TriangleAlert, Users } from "lucide-react";

import { PageHeader } from "../components/common/PageHeader";
import { usersService, UserStats } from "../services/usersService";
import { KpiCard } from "../features/admin/components/KpiCard";
import { AdminQuickAction } from "../features/admin/components/AdminQuickAction";
import { PermissionsMatrix } from "../features/admin/components/PermissionsMatrix";
import { RoleCard } from "../features/admin/components/RoleCard";
import { CandidateJobFlowDiagnosticsCard } from "../features/admin/components/CandidateJobFlowDiagnosticsCard";
import { ROLES } from "../features/admin/config/adminConfig";
import { AiGovernancePanel } from "../features/ai-settings/components/AiGovernancePanel";
import { SystemHealthPage } from "./SystemHealthPage";

type AdminTab = "overview" | "permissions" | "diagnostics" | "ia" | "health";

const TAB_ITEMS: Array<{ key: AdminTab; label: string }> = [
  { key: "overview", label: "Painel Geral e Ações" },
  { key: "permissions", label: "Matriz de Permissões" },
  { key: "diagnostics", label: "Diagnóstico Operacional" },
  { key: "ia", label: "IA" },
  { key: "health", label: "Health do Sistema" },
];

export function AdminPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");

  useEffect(() => {
    void usersService.stats().then(setStats);
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6 pb-12">
      <PageHeader
        title="Painel de administração"
        subtitle="Visão geral da plataforma e controle de acessos"
      />

      {/* Tabs navigation menu */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface p-2 shadow-sm">
        {TAB_ITEMS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={[
                "flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200",
                isActive
                  ? "bg-surface-muted text-text shadow-sm"
                  : "text-text-muted hover:bg-surface-muted/60 hover:text-text",
              ].join(" ")}
            >
              {tab.key === "overview" && <Activity className="h-4 w-4 text-[hsl(var(--primary))]" />}
              {tab.key === "permissions" && <ShieldCheck className="h-4 w-4 text-emerald-600" />}
              {tab.key === "diagnostics" && <FileSearch className="h-4 w-4 text-amber-600" />}
              {tab.key === "ia" && <BrainCircuit className="h-4 w-4 text-blue-600" />}
              {tab.key === "health" && <HeartPulse className="h-4 w-4 text-rose-600" />}
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "overview" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* KPI strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <KpiCard label="Total de usuários"  value={stats?.total_users   ?? "—"} icon={<Users       className="h-4 w-4 text-blue-600" />} />
            <KpiCard label="Ativos"             value={stats?.active_users  ?? "—"} icon={<CheckCircle2 className="h-4 w-4 text-green-600" />} />
            <KpiCard label="Admins"             value={stats?.admins        ?? "—"} icon={<ShieldCheck  className="h-4 w-4 text-indigo-600" />} />
            <KpiCard label="Recrutadores"       value={stats?.recruiters    ?? "—"} icon={<Users        className="h-4 w-4 text-purple-600" />} />
            <KpiCard label="Leitores"           value={stats?.viewers       ?? "—"} icon={<Users        className="h-4 w-4 text-gray-400" />} />
          </div>

          {/* Quick actions */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <AdminQuickAction
              icon={<Users className="h-4 w-4 text-blue-600" />}
              title="Gerenciar usuários internos"
              description="Crie contas internas (admin, recrutador, leitor) e gerencie perfis de acesso da equipe."
              buttonLabel="Abrir gestão de usuários internos"
              onButtonClick={() => navigate("/admin/usuarios")}
              variant="blue"
            />

            <AdminQuickAction
              icon={<Tags className="h-4 w-4 text-purple-600" />}
              title="Cadastros"
              description="Skills, áreas e outros catálogos do sistema."
              buttonLabel="Acessar cadastros"
              onButtonClick={() => navigate("/admin/cadastros")}
              variant="default"
            />

            <AdminQuickAction
              icon={<MapPinned className="h-4 w-4 text-cyan-700" />}
              title="Estrutura operacional"
              description="Grupos, localidades e filiais/postos usados pelo RH e pelo Protheus."
              buttonLabel="Abrir estrutura operacional"
              onButtonClick={() => navigate("/admin/estrutura-operacional")}
              variant="default"
            />

            <AdminQuickAction
              icon={<FileSearch className="h-4 w-4 text-amber-600" />}
              title="Auditoria"
              description="Acompanhe ações realizadas no sistema, alterações de cadastros e eventos administrativos."
              buttonLabel="Ver auditoria"
              onButtonClick={() => navigate("/admin/auditoria")}
              variant="default"
            />

            <AdminQuickAction
              icon={<Activity className="h-4 w-4 text-rose-600" />}
              title="Health do Sistema"
              description="Monitore backend, filas, banco e uso de IA."
              buttonLabel="Ver health"
              onButtonClick={() => setActiveTab("health")}
              variant="default"
            />

            <AdminQuickAction
              icon={<KeyRound className="h-4 w-4 text-emerald-600" />}
              title="Credenciais de IA"
              description="Cadastre e rotacione chaves Gemini e Claude sem exibir segredos após salvar."
              buttonLabel="Gerenciar chaves IA"
              onButtonClick={() => navigate("/admin/ai-provider-credentials")}
              variant="default"
            />

            <AdminQuickAction
              icon={<BrainCircuit className="h-4 w-4 text-blue-600" />}
              title="Governança IA"
              description="Acompanhe status, consumo de tokens, warnings e atalhos administrativos de IA."
              buttonLabel="Abrir aba IA"
              onButtonClick={() => setActiveTab("ia")}
              variant="default"
            />

            <AdminQuickAction
              icon={<FlaskConical className="h-4 w-4 text-orange-600" />}
              title="Laboratório IA"
              description="Teste intents RAG, consulte status de providers e flags de segurança em ambiente controlado."
              buttonLabel="Abrir Laboratório"
              onButtonClick={() => navigate("/admin/ia")}
              variant="default"
            />

            <AdminQuickAction
              icon={<BrainCircuit className="h-4 w-4 text-cyan-700" />}
              title="Base de conhecimento"
              description="Cadastre documentos Markdown/texto, acompanhe indexação e teste a busca RAG com segurança."
              buttonLabel="Gerenciar conhecimento"
              onButtonClick={() => navigate("/admin/conhecimento")}
              variant="default"
            />

            <AdminQuickAction
              icon={<BarChart3 className="h-4 w-4 text-blue-600" />}
              title="BI de Recrutamento"
              description="Indicadores de vagas, candidatos, análises e uso de IA."
              buttonLabel="Ver BI"
              onButtonClick={() => navigate("/admin/bi")}
              variant="default"
            />

            <AdminQuickAction
              icon={<FileSpreadsheet className="h-4 w-4 text-emerald-700" />}
              title="Importação por formulário"
              description="Importe candidatos via Google Forms ou planilhas estruturadas."
              buttonLabel="Abrir importação"
              onButtonClick={() => navigate("/importar-formulario")}
              variant="default"
            />

            <AdminQuickAction
              icon={<ClipboardList className="h-4 w-4 text-teal-600" />}
              title="Avaliações comportamentais"
              description="Crie e gerencie templates de avaliação com competências e perguntas estruturadas. Vincule templates às vagas para avaliação de candidatos."
              buttonLabel="Gerenciar templates"
              onButtonClick={() => navigate("/admin/behavioral-templates")}
              variant="default"
            />

            <AdminQuickAction
              icon={<ShieldCheck className="h-4 w-4 text-emerald-600" />}
              title="Como funciona o acesso"
              description="Cada usuário tem um perfil que define quais telas ele pode acessar. Para liberar ou restringir, altere o perfil na tabela de usuários."
              buttonLabel="Matriz de permissões"
              onButtonClick={() => setActiveTab("permissions")}
              variant="default"
            />
          </div>

          {/* Role cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 pt-4">
            {ROLES.map((role) => (
              <RoleCard key={role.key} label={role.label} description={role.description} roleKey={role.key} />
            ))}
          </div>
        </div>
      )}

      {activeTab === "permissions" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Permissions matrix */}
          <PermissionsMatrix />
        </div>
      )}

      {activeTab === "diagnostics" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Candidate+job diagnostics */}
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-text">Diagnóstico operacional</h2>
            <p className="text-sm text-text-muted">
              Use este painel para investigar inconsistências de análise e aderência por candidata(o) e vaga.
            </p>
            <CandidateJobFlowDiagnosticsCard />
          </section>
        </div>
      )}

      {activeTab === "health" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* System health page embedded without double header */}
          <SystemHealthPage hideHeader />
        </div>
      )}

      {activeTab === "ia" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <AiGovernancePanel />
        </div>
      )}
    </div>
  );
}
