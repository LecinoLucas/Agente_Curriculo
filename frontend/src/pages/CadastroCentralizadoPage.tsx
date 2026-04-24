import { useState } from "react";

import { Card } from "../components/common/Card";
import { PageHeader } from "../components/common/PageHeader";
import { Tabs } from "../components/common/Tabs";
import { useAuth } from "../features/auth/useAuth";
import { CandidatosPage } from "./CandidatosPage";
import { VagasPage } from "./VagasPage";
import { SkillsPage } from "./SkillsPage";
import { UsersPage } from "./UsersPage";

type TabKey = "candidatos" | "vagas" | "skills" | "usuarios";

export function CadastroCentralizadoPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const tabs: { key: TabKey; label: string; caption: string }[] = [
    { key: "candidatos", label: "Candidatos", caption: "dados, histórico e currículo base" },
    { key: "vagas", label: "Vagas", caption: "aberturas, requisitos e publicação" },
    { key: "skills", label: "Skills", caption: "vocabulário técnico e taxonomia" },
    ...(isAdmin ? [{ key: "usuarios" as TabKey, label: "Usuários", caption: "acessos, perfis e governança" }] : []),
  ];

  const [activeTab, setActiveTab] = useState<TabKey>("candidatos");
  const activeTabMeta = tabs.find((tab) => tab.key === activeTab);

  return (
    <div className="page-grid">
      <PageHeader
        title="Central de cadastros"
        subtitle="Organize as bases que alimentam recrutamento, análise de currículos e operação do time."
      />

      <Card
        title="Base operacional do recrutamento"
        description="Esta área reúne os registros centrais do sistema. Em vez de navegar por telas isoladas, você pode manter candidatos, vagas, skills e acessos a partir de uma mesma jornada."
      >
        <div className="stats-mini">
          <div className="stat-mini">
            <div className="stat-mini-label">Área ativa</div>
            <div className="stat-mini-value">{activeTabMeta?.label ?? "Cadastros"}</div>
          </div>
          <div className="stat-mini">
            <div className="stat-mini-label">Foco atual</div>
            <div className="stat-mini-value">{isAdmin ? "Operação completa" : "Operação de recrutamento"}</div>
          </div>
          <div className="stat-mini">
            <div className="stat-mini-label">Objetivo</div>
            <div className="stat-mini-value">Dados confiáveis</div>
          </div>
        </div>
      </Card>

      <Card
        title={activeTabMeta?.label ?? "Cadastros"}
        description={activeTabMeta?.caption ?? "Mantenha os dados principais atualizados para apoiar o restante da plataforma."}
      >
        <Tabs tabs={tabs} active={activeTab} onChange={(k) => setActiveTab(k as TabKey)} />
      </Card>

      <div className="tab-panel">
        {activeTab === "candidatos" && <CandidatosPage />}
        {activeTab === "vagas" && <VagasPage />}
        {activeTab === "skills" && <SkillsPage />}
        {activeTab === "usuarios" && isAdmin && <UsersPage />}
      </div>
    </div>
  );
}
