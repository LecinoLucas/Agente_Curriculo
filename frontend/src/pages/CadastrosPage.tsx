import { useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { PageHeader } from "../components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { DataTable } from "../components/common/DataTable";
import { ActionMenu } from "../components/common/ActionMenu";
import { CreateSkillModal } from "../features/jobs/components/CreateSkillModal";
import { CreateJobAreaModal } from "../features/jobs/components/CreateJobAreaModal";
import { EditSkillModal } from "../features/admin/components/EditSkillModal";
import { ArchiveSkillModal } from "../features/admin/components/ArchiveSkillModal";
import { ConfirmDeleteJobAreaModal } from "../features/admin/components/ConfirmDeleteJobAreaModal";
import { skillsService, type SkillCatalog } from "../services/skillsService";
import { jobAreasService, type JobArea } from "../services/jobAreasService";
import { candidatesService } from "../services/candidatesService";
import { listJobs } from "../services/jobsService";
import { useAsyncState } from "../hooks/useAsyncState";
import { Badge } from "@/components/ui/badge";
import { toast } from "../shared/utils/toast";
import type { Candidate, Job } from "../types/domain";

const CATEGORIES = [
  { value: "", label: "Todas as categorias" },
  { value: "technical", label: "Técnica" },
  { value: "tool", label: "Ferramenta" },
  { value: "behavioral", label: "Comportamental" },
  { value: "business_process", label: "Processo" },
  { value: "domain", label: "Domínio" },
  { value: "certification", label: "Certificação" },
  { value: "other", label: "Outro" },
] as const;

const SKILL_STATUS_FILTERS = [
  { value: "all", label: "Ativas e inativas" },
  { value: "active", label: "Ativas" },
  { value: "inactive", label: "Inativas" },
] as const;

const SKILL_ARCHIVE_REASON_LABELS: Record<string, string> = {
  duplicate: "Duplicada",
  obsolete: "Obsoleta",
  merged: "Unificada em outra skill",
  cleanup: "Higienização do catálogo",
};

const CANDIDATE_ARCHIVE_REASON_LABELS: Record<string, string> = {
  duplicate: "Cadastro duplicado",
  inactive_profile: "Perfil fora do fluxo ativo",
  requested_removal: "Solicitação interna",
  data_cleanup: "Higienização de base",
};

type MainTab = "skills" | "areas" | "archived";
type ArchivedTab = "skills" | "jobs" | "candidates";
type SkillStatusFilter = (typeof SKILL_STATUS_FILTERS)[number]["value"];

function categoryLabel(category: string | null) {
  return CATEGORIES.find((item) => item.value === category)?.label ?? category ?? "—";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function skillArchiveReasonLabel(value: string | null | undefined) {
  if (!value) return "—";
  return SKILL_ARCHIVE_REASON_LABELS[value] ?? value;
}

function candidateArchiveReasonLabel(value: string | null | undefined) {
  if (!value) return "—";
  return CANDIDATE_ARCHIVE_REASON_LABELS[value] ?? value;
}

function skillStatusBadge(skill: SkillCatalog) {
  if (skill.archived_at) {
    return (
      <Badge variant="outline" className="border-gray-200 bg-gray-50 text-gray-600">
        Arquivada
      </Badge>
    );
  }

  if (skill.is_active) {
    return (
      <Badge variant="outline" className="border-green-200 bg-green-50 text-green-600">
        Ativa
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
      Inativa
    </Badge>
  );
}

export function CadastrosPage() {
  const [activeTab, setActiveTab] = useState<MainTab>("skills");
  const [archivedTab, setArchivedTab] = useState<ArchivedTab>("skills");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [skillStatusFilter, setSkillStatusFilter] = useState<SkillStatusFilter>("all");
  const [searchArea, setSearchArea] = useState("");
  const [archivedSkillSearch, setArchivedSkillSearch] = useState("");
  const [archivedCandidateSearch, setArchivedCandidateSearch] = useState("");
  const [archivedJobSearch, setArchivedJobSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateAreaModal, setShowCreateAreaModal] = useState(false);
  const [editingSkill, setEditingSkill] = useState<SkillCatalog | null>(null);
  const [archivingSkill, setArchivingSkill] = useState<SkillCatalog | null>(null);
  const [deletingArea, setDeletingArea] = useState<JobArea | null>(null);

  const skillsState = useAsyncState<{ data: SkillCatalog[]; total: number }>();
  const archivedSkillsState = useAsyncState<{ data: SkillCatalog[]; total: number }>();
  const archivedJobsState = useAsyncState<{ data: Job[]; total: number }>();
  const archivedCandidatesState = useAsyncState<{ data: Candidate[]; total: number }>();
  const areasState = useAsyncState<{ data: JobArea[]; total: number }>();

  const currentSkillActiveFilter = useMemo<boolean | undefined>(() => {
    if (skillStatusFilter === "active") return true;
    if (skillStatusFilter === "inactive") return false;
    return undefined;
  }, [skillStatusFilter]);

  const loadSkills = () => {
    void skillsState.run(() =>
      skillsService.listSkills({
        search: search || undefined,
        category: category || undefined,
        is_active: currentSkillActiveFilter,
        archived: false,
        page_size: 100,
      }),
    );
  };

  const loadArchivedSkills = () => {
    void archivedSkillsState.run(() =>
      skillsService.listSkills({
        search: archivedSkillSearch || undefined,
        archived: true,
        page_size: 100,
      }),
    );
  };

  const loadArchivedJobs = () => {
    void archivedJobsState.run(async () => {
      const response = await listJobs(1, 100, { 
        statusFilter: "archived",
        search: archivedJobSearch || undefined
      });
      return {
        data: response.data,
        total: response.total,
      };
    });
  };

  const loadArchivedCandidates = () => {
    void archivedCandidatesState.run(async () => {
      const response = await candidatesService.list(1, 100, {
        search: archivedCandidateSearch || undefined,
        archived: true,
      });
      return {
        data: response.data,
        total: response.total,
      };
    });
  };

  const loadAreas = () => {
    void areasState.run(() => jobAreasService.listJobAreas({ search: searchArea, is_active: undefined, page_size: 100 }));
  };

  useEffect(() => {
    if (activeTab === "skills") {
      loadSkills();
    }
  }, [activeTab, search, category, currentSkillActiveFilter]);

  useEffect(() => {
    if (activeTab === "areas") {
      loadAreas();
    }
  }, [activeTab, searchArea]);

  useEffect(() => {
    if (activeTab !== "archived") return;
    if (archivedTab === "skills") {
      loadArchivedSkills();
      return;
    }
    if (archivedTab === "jobs") {
      loadArchivedJobs();
      return;
    }
    if (archivedTab === "candidates") {
      loadArchivedCandidates();
    }
  }, [activeTab, archivedTab, archivedCandidateSearch, archivedSkillSearch, archivedJobSearch]);

  const skills = skillsState.data?.data ?? [];
  const archivedSkills = archivedSkillsState.data?.data ?? [];
  const areas = areasState.data?.data ?? [];
  const archivedJobs = archivedJobsState.data?.data ?? [];
  const archivedCandidates = archivedCandidatesState.data?.data ?? [];

  async function handleToggleSkillStatus(skill: SkillCatalog) {
    try {
      if (skill.is_active) {
        await skillsService.deactivateSkill(skill.id);
        toast.success("Skill inativada com sucesso.");
      } else {
        await skillsService.activateSkill(skill.id);
        toast.success("Skill reativada com sucesso.");
      }
      loadSkills();
      if (activeTab === "archived" && archivedTab === "skills") {
        loadArchivedSkills();
      }
    } catch {
      toast.error("Não foi possível alterar o status da skill.");
    }
  }

  async function handleRestoreSkill(skill: SkillCatalog) {
    try {
      await skillsService.restoreSkill(skill.id);
      toast.success("Skill restaurada. Ela voltou como inativa.");
      loadArchivedSkills();
      loadSkills();
    } catch {
      toast.error("Não foi possível restaurar a skill.");
    }
  }

  async function handleRestoreCandidate(candidate: Candidate) {
    try {
      await candidatesService.restore(candidate.id);
      toast.success("Candidato restaurado. Ele voltou para a listagem ativa.");
      loadArchivedCandidates();
    } catch {
      toast.error("Não foi possível restaurar o candidato.");
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 sm:px-6 py-6 pb-12">
      <PageHeader
        title="Cadastros"
        subtitle="Gerencie skills, áreas e itens arquivados preservados para histórico e auditoria."
      />

      <div className="flex border-b border-[hsl(var(--border))]">
        {[
          { key: "skills", label: "Skills" },
          { key: "areas", label: "Áreas" },
          { key: "archived", label: "Arquivados" },
        ].map((tab) => (
          <button
            key={tab.key}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "border-b-2 border-[hsl(var(--primary))] text-[hsl(var(--text))]"
                : "text-[hsl(var(--text-muted))] hover:text-[hsl(var(--text))]"
            }`}
            onClick={() => setActiveTab(tab.key as MainTab)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "skills" ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--text-muted))]" />
              <input
                type="text"
                placeholder="Buscar por nome ou alias..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="ui-input w-full pl-10 text-sm"
              />
            </div>

            <select
              value={skillStatusFilter}
              onChange={(e) => setSkillStatusFilter(e.target.value as SkillStatusFilter)}
              className="ui-input text-sm"
            >
              {SKILL_STATUS_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="ui-input text-sm"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>

            <Button onClick={() => setShowCreateModal(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Nova skill
            </Button>
          </div>

          <DataTable<SkillCatalog>
            columns={[
              { header: "Nome", className: "w-[22%]" },
              { header: "Categoria", className: "w-[14%]" },
              { header: "Aliases", className: "w-[28%]" },
              { header: "Descrição", className: "w-[18%]" },
              { header: "Status", className: "w-[8%]" },
              { header: "Ações", className: "w-[20%] text-right" },
            ]}
            items={skills}
            loading={skillsState.loading}
            error={skillsState.error}
            empty={{
              title: "Nenhuma skill encontrada",
              description: "Tente mudar os filtros ou crie uma nova skill.",
              action: {
                label: "Nova skill",
                onClick: () => setShowCreateModal(true),
              },
            }}
            renderRow={(skill) => (
              <tr key={skill.id} className="border-b border-[hsl(var(--border))] hover:bg-[hsl(var(--surface-muted))]/50">
                <td className="px-4 py-3 text-sm font-medium text-[hsl(var(--text))]">{skill.name}</td>
                <td className="px-4 py-3 text-sm text-[hsl(var(--text-muted))]">{categoryLabel(skill.category)}</td>
                <td className="px-4 py-3 text-sm text-[hsl(var(--text-muted))]">
                  <div className="flex flex-wrap gap-1">
                    {skill.aliases.map((alias) => (
                      <Badge key={alias.id} variant="secondary" className="text-xs">
                        {alias.alias}
                      </Badge>
                    ))}
                    {skill.aliases.length === 0 ? "—" : null}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-[hsl(var(--text-muted))]">
                  <span className="line-clamp-2">{skill.description ?? "—"}</span>
                </td>
                <td className="px-4 py-3 text-sm">{skillStatusBadge(skill)}</td>
                <td className="px-4 py-3 text-sm text-right">
                  <ActionMenu
                    buttonLabel={`Ações para ${skill.name}`}
                    items={[
                      {
                        label: "Editar",
                        onClick: () => setEditingSkill(skill),
                      },
                      {
                        label: skill.is_active ? "Inativar" : "Reativar",
                        onClick: () => void handleToggleSkillStatus(skill),
                      },
                      ...(!skill.is_active ? [{
                        label: "Arquivar",
                        onClick: () => setArchivingSkill(skill),
                      }] : []),
                    ]}
                  />
                </td>
              </tr>
            )}
            footer={<div className="text-xs text-[hsl(var(--text-muted))]">Total de {skillsState.data?.total ?? 0} skills.</div>}
          />
        </div>
      ) : null}

      {activeTab === "areas" ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--text-muted))]" />
              <input
                type="text"
                placeholder="Buscar por nome..."
                value={searchArea}
                onChange={(e) => setSearchArea(e.target.value)}
                className="ui-input w-full pl-10 text-sm"
              />
            </div>

            <Button onClick={() => setShowCreateAreaModal(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Nova área
            </Button>
          </div>

          <DataTable<JobArea>
            columns={[
              { header: "Nome", className: "w-[32%]" },
              { header: "Descrição", className: "w-[40%]" },
              { header: "Status", className: "w-[10%]" },
              { header: "Ações", className: "w-[18%] text-right" },
            ]}
            items={areas}
            loading={areasState.loading}
            error={areasState.error}
            empty={{
              title: "Nenhuma área encontrada",
              description: "Tente mudar os filtros ou crie uma nova área.",
              action: {
                label: "Nova área",
                onClick: () => setShowCreateAreaModal(true),
              },
            }}
            renderRow={(area) => (
              <tr key={area.id} className="border-b border-[hsl(var(--border))] hover:bg-[hsl(var(--surface-muted))]/50">
                <td className="px-4 py-3 text-sm font-medium text-[hsl(var(--text))]">{area.name}</td>
                <td className="px-4 py-3 text-sm text-[hsl(var(--text-muted))]">{area.description ?? "—"}</td>
                <td className="px-4 py-3 text-sm">
                  {area.is_active ? (
                    <Badge variant="outline" className="border-green-200 bg-green-50 text-green-600">
                      Ativa
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                      Inativa
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-right">
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          if (area.is_active) {
                            await jobAreasService.deactivateJobArea(area.id);
                            toast.success("Área inativada com sucesso.");
                          } else {
                            await jobAreasService.activateJobArea(area.id);
                            toast.success("Área reativada com sucesso.");
                          }
                          loadAreas();
                        } catch {
                          toast.error("Erro ao alterar status da área.");
                        }
                      }}
                    >
                      {area.is_active ? "Inativar" : "Reativar"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-[hsl(var(--danger))] hover:bg-[hsl(var(--danger-soft))] hover:text-[hsl(var(--danger))]"
                      onClick={() => setDeletingArea(area)}
                    >
                      Excluir
                    </Button>
                  </div>
                </td>
              </tr>
            )}
            footer={<div className="text-xs text-[hsl(var(--text-muted))]">Total de {areasState.data?.total ?? 0} áreas.</div>}
          />
        </div>
      ) : null}

      {activeTab === "archived" ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-5 py-4">
            <h2 className="text-base font-semibold text-[hsl(var(--text))]">Arquivados</h2>
            <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">
              Itens removidos do fluxo ativo, mas preservados para histórico e auditoria.
            </p>
          </div>

          <div className="flex border-b border-[hsl(var(--border))] mb-4">
            {[
              { key: "skills", label: `Skills (${archivedSkillsState.data?.total ?? 0})` },
              { key: "jobs", label: `Vagas (${archivedJobsState.data?.total ?? 0})` },
              { key: "candidates", label: `Candidatos (${archivedCandidatesState.data?.total ?? 0})` },
            ].map((tab) => (
              <button
                key={tab.key}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  archivedTab === tab.key
                    ? "border-b-2 border-[hsl(var(--primary))] text-[hsl(var(--text))]"
                    : "text-[hsl(var(--text-muted))] hover:text-[hsl(var(--text))]"
                }`}
                onClick={() => setArchivedTab(tab.key as ArchivedTab)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {archivedTab === "skills" ? (
            <div className="space-y-4">
              <div className="relative max-w-xl">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--text-muted))]" />
                <input
                  type="text"
                  placeholder="Buscar skill arquivada..."
                  value={archivedSkillSearch}
                  onChange={(e) => setArchivedSkillSearch(e.target.value)}
                  className="ui-input w-full pl-10 text-sm"
                />
              </div>

              <DataTable<SkillCatalog>
                columns={[
                  { header: "Nome", className: "w-[22%]" },
                  { header: "Categoria", className: "w-[16%]" },
                  { header: "Arquivada em", className: "w-[18%]" },
                  { header: "Motivo", className: "w-[24%]" },
                  { header: "Ações", className: "w-[20%] text-right" },
                ]}
                items={archivedSkills}
                loading={archivedSkillsState.loading}
                error={archivedSkillsState.error}
                empty={{
                  title: "Nenhuma skill arquivada",
                  description: "As skills arquivadas aparecerão aqui.",
                }}
                renderRow={(skill) => (
                  <tr key={skill.id} className="border-b border-[hsl(var(--border))] hover:bg-[hsl(var(--surface-muted))]/50">
                    <td className="px-4 py-3 text-sm font-medium text-[hsl(var(--text))]">{skill.name}</td>
                    <td className="px-4 py-3 text-sm text-[hsl(var(--text-muted))]">{categoryLabel(skill.category)}</td>
                    <td className="px-4 py-3 text-sm text-[hsl(var(--text-muted))]">{formatDate(skill.archived_at)}</td>
                    <td className="px-4 py-3 text-sm text-[hsl(var(--text-muted))]">
                      <div className="space-y-1">
                        <div>{skillArchiveReasonLabel(skill.archive_reason)}</div>
                        {skill.archive_reason_note ? (
                          <div className="line-clamp-2 text-xs">{skill.archive_reason_note}</div>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-sm">
                      <Button size="sm" variant="outline" onClick={() => void handleRestoreSkill(skill)}>
                        Restaurar
                      </Button>
                    </td>
                  </tr>
                )}
                footer={<div className="text-xs text-[hsl(var(--text-muted))]">Total de {archivedSkillsState.data?.total ?? 0} skills arquivadas.</div>}
              />
            </div>
          ) : null}

          {archivedTab === "jobs" ? (
            <div className="space-y-4">
              <div className="relative max-w-xl">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--text-muted))]" />
                <input
                  type="text"
                  placeholder="Buscar vaga arquivada..."
                  value={archivedJobSearch}
                  onChange={(e) => setArchivedJobSearch(e.target.value)}
                  className="ui-input w-full pl-10 text-sm"
                />
              </div>

              <DataTable<Job>
              columns={[
                { header: "Título", className: "w-[36%]" },
                { header: "Status", className: "w-[12%]" },
                { header: "Arquivada em", className: "w-[20%]" },
                { header: "Motivo", className: "w-[20%]" },
                { header: "Ações", className: "w-[12%] text-right" },
              ]}
              items={archivedJobs}
              loading={archivedJobsState.loading}
              error={archivedJobsState.error}
              empty={{
                title: "Nenhuma vaga arquivada",
                description: "Vagas arquivadas serão exibidas aqui.",
              }}
              renderRow={(job) => (
                <tr key={job.id} className="border-b border-[hsl(var(--border))] hover:bg-[hsl(var(--surface-muted))]/50">
                  <td className="px-4 py-3 text-sm font-medium text-[hsl(var(--text))]">{job.title}</td>
                  <td className="px-4 py-3 text-sm text-[hsl(var(--text-muted))]">
                    <Badge variant="outline" className="border-gray-200 bg-gray-50 text-gray-600">
                      Arquivada
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-[hsl(var(--text-muted))]">{formatDate(job.archived_at)}</td>
                  <td className="px-4 py-3 text-sm text-[hsl(var(--text-muted))]">{job.archive_reason ?? "—"}</td>
                  <td className="px-4 py-3 text-right text-sm text-[hsl(var(--text-muted))]">Somente leitura</td>
                </tr>
              )}
              footer={<div className="text-xs text-[hsl(var(--text-muted))]">Total de {archivedJobsState.data?.total ?? 0} vagas arquivadas.</div>}
            />
            </div>
          ) : null}

          {archivedTab === "candidates" ? (
            <div className="space-y-4">
              <div className="relative max-w-xl">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--text-muted))]" />
                <input
                  type="text"
                  placeholder="Buscar candidato arquivado..."
                  value={archivedCandidateSearch}
                  onChange={(e) => setArchivedCandidateSearch(e.target.value)}
                  className="ui-input w-full pl-10 text-sm"
                />
              </div>

              <DataTable<Candidate>
                columns={[
                  { header: "Nome", className: "w-[24%]" },
                  { header: "E-mail", className: "w-[18%]" },
                  { header: "Arquivado em", className: "w-[18%]" },
                  { header: "Motivo", className: "w-[28%]" },
                  { header: "Ações", className: "w-[12%] text-right" },
                ]}
                items={archivedCandidates}
                loading={archivedCandidatesState.loading}
                error={archivedCandidatesState.error}
                empty={{
                  title: "Nenhum candidato arquivado",
                  description: "Os candidatos arquivados aparecerão aqui.",
                }}
                renderRow={(candidate) => (
                  <tr key={candidate.id} className="border-b border-[hsl(var(--border))] hover:bg-[hsl(var(--surface-muted))]/50">
                    <td className="px-4 py-3 text-sm font-medium text-[hsl(var(--text))]">{candidate.full_name}</td>
                    <td className="px-4 py-3 text-sm text-[hsl(var(--text-muted))]">{candidate.email ?? "—"}</td>
                    <td className="px-4 py-3 text-sm text-[hsl(var(--text-muted))]">{formatDate(candidate.archived_at)}</td>
                    <td className="px-4 py-3 text-sm text-[hsl(var(--text-muted))]">
                      <div className="space-y-1">
                        <div>{candidateArchiveReasonLabel(candidate.archive_reason)}</div>
                        {candidate.archive_reason_note ? (
                          <div className="line-clamp-2 text-xs">{candidate.archive_reason_note}</div>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-sm">
                      <Button size="sm" variant="outline" onClick={() => void handleRestoreCandidate(candidate)}>
                        Restaurar
                      </Button>
                    </td>
                  </tr>
                )}
                footer={<div className="text-xs text-[hsl(var(--text-muted))]">Total de {archivedCandidatesState.data?.total ?? 0} candidatos arquivados.</div>}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <CreateSkillModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => {
          setShowCreateModal(false);
          loadSkills();
        }}
      />

      <EditSkillModal
        open={editingSkill !== null}
        skill={editingSkill}
        onClose={() => setEditingSkill(null)}
        onSuccess={() => {
          toast.success("Skill atualizada com sucesso.");
          loadSkills();
          loadArchivedSkills();
        }}
      />

      <ArchiveSkillModal
        open={archivingSkill !== null}
        skill={archivingSkill}
        onClose={() => setArchivingSkill(null)}
        onSuccess={() => {
          setArchivingSkill(null);
          toast.success("Skill arquivada com sucesso.");
          loadSkills();
          loadArchivedSkills();
        }}
      />

      <CreateJobAreaModal
        open={showCreateAreaModal}
        onClose={() => setShowCreateAreaModal(false)}
        onSuccess={() => {
          setShowCreateAreaModal(false);
          loadAreas();
        }}
      />

      <ConfirmDeleteJobAreaModal
        open={deletingArea !== null}
        area={deletingArea}
        onClose={() => setDeletingArea(null)}
        onSuccess={() => {
          setDeletingArea(null);
          loadAreas();
        }}
      />
    </div>
  );
}
