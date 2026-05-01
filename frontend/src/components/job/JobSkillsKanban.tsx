import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { skillsService } from "../../services/skillsService";
import { JobSkill, Skill } from "../../types/domain";
import { toast } from "../../services/toast";
import { ChevronRight, ChevronLeft, Info, X, Check } from "lucide-react";

// Local types
export type PendingJobSkill = {
  skill_id: string;
  skill_name: string;
  skill_category: string | null;
  skill_aliases: string[];
  is_mandatory: boolean;
  minimum_level: string | null;
  minimum_years: number | null;
  weight: number;
};

type JobSkillsKanbanProps = {
  jobId: string | null;
  jobSkills: JobSkill[];
  allSkills: Skill[];
  pendingSkills: PendingJobSkill[];
  onAddPending: (s: PendingJobSkill) => void;
  onRemovePending: (skillId: string) => void;
  onUpdatePending: (skillId: string, patch: Partial<PendingJobSkill>) => void;
  onSkillAdded: () => void;
  onSkillUpdated: () => void;
};

// Skill card for bank (left column)
function SkillBankCard({
  skill,
  isLinked,
  onSelectToAdd,
}: {
  skill: Skill;
  isLinked: boolean;
  onSelectToAdd: (mandatory: boolean) => void;
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-3 hover:bg-[hsl(var(--surface-muted))] transition">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-[hsl(var(--text))]">{skill.name}</div>
            {skill.category && (
              <div className="text-xs text-[hsl(var(--text-muted))]">{skill.category}</div>
            )}
          </div>
          {skill.aliases && skill.aliases.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowTooltip(!showTooltip)}
                className="text-[hsl(var(--text-muted))] hover:text-[hsl(var(--text))]"
                title="Ver aliases"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
              {showTooltip && (
                <div className="absolute right-0 z-10 mt-1 w-48 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-2 text-xs text-[hsl(var(--text-muted))] shadow-lg">
                  <div className="font-semibold text-[hsl(var(--text))] mb-1">Aliases:</div>
                  {skill.aliases.map((alias) => (
                    <div key={alias}>{alias}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {isLinked && (
          <div className="text-xs text-[hsl(var(--warning))]">
            ✓ Já adicionada
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isLinked}
            onClick={() => onSelectToAdd(true)}
            className="flex-1 text-xs h-7"
          >
            + Obrigatória
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isLinked}
            onClick={() => onSelectToAdd(false)}
            className="flex-1 text-xs h-7"
          >
            + Desejável
          </Button>
        </div>
      </div>
    </div>
  );
}

// Skill card for mandatory/optional columns
type LinkedSkillCardProps = {
  skill: JobSkill | PendingJobSkill;
  isMandatory: boolean;
  isEditing: boolean;
  isSaving: boolean;
  onToggleMandatory: () => void;
  onRemove: () => void;
  onUpdateWeight: (weight: number) => void;
  onUpdateLevel: (level: string | null) => void;
  onUpdateYears: (years: number | null) => void;
};

function LinkedSkillCard({
  skill,
  isMandatory,
  isEditing,
  isSaving,
  onToggleMandatory,
  onRemove,
  onUpdateWeight,
  onUpdateLevel,
  onUpdateYears,
}: LinkedSkillCardProps) {
  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-3 hover:bg-[hsl(var(--surface-muted))] transition">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-[hsl(var(--text))]">
              {skill.skill_name}
            </div>
            {skill.skill_category && (
              <div className="text-xs text-[hsl(var(--text-muted))]">
                {skill.skill_category}
              </div>
            )}
          </div>
          <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold text-[hsl(var(--surface))] bg-[hsl(var(--primary))]">
            {isMandatory ? "Obr." : "Des."}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <label className="flex flex-col gap-1">
            <span className="text-[hsl(var(--text-muted))]">Peso</span>
            <input
              type="number"
              min="0"
              max="10"
              step="0.1"
              value={skill.weight}
              onChange={(e) => onUpdateWeight(Number(e.target.value))}
              onBlur={(e) => onUpdateWeight(Number(e.target.value))}
              disabled={isSaving}
              className="ui-input h-7 rounded px-2 text-xs"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[hsl(var(--text-muted))]">Nível mín.</span>
            <select
              value={skill.minimum_level ?? ""}
              onChange={(e) => onUpdateLevel(e.target.value || null)}
              disabled={isSaving}
              className="ui-input h-7 rounded px-2 text-xs"
            >
              <option value="">—</option>
              <option value="intern">Estagiário</option>
              <option value="junior">Júnior</option>
              <option value="mid">Pleno</option>
              <option value="senior">Sênior</option>
              <option value="lead">Lead</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 col-span-2">
            <span className="text-[hsl(var(--text-muted))]">Anos mín.</span>
            <input
              type="number"
              min="0"
              max="50"
              step="0.5"
              value={skill.minimum_years ?? ""}
              onChange={(e) => onUpdateYears(e.target.value ? Number(e.target.value) : null)}
              onBlur={(e) => onUpdateYears(e.target.value ? Number(e.target.value) : null)}
              disabled={isSaving}
              className="ui-input h-7 rounded px-2 text-xs"
              placeholder="—"
            />
          </label>
        </div>

        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isSaving}
            onClick={onToggleMandatory}
            className="flex-1 h-7 text-xs"
          >
            {isMandatory ? "→ Desejável" : "← Obrigatória"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={isSaving}
            onClick={onRemove}
            className="h-7 w-7 p-0"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// Mini form to add a skill
function AddSkillForm({
  skill: selectedSkill,
  onAdd,
  onCancel,
  isSaving,
}: {
  skill: Skill;
  onAdd: (config: Omit<PendingJobSkill, "skill_name" | "skill_category" | "skill_aliases">) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [weight, setWeight] = useState(1);
  const [level, setLevel] = useState<string | null>(null);
  const [years, setYears] = useState<number | null>(null);
  const [isMandatory, setIsMandatory] = useState(false);

  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4 space-y-3">
      <h4 className="text-sm font-semibold text-[hsl(var(--text))]">Configurar: {selectedSkill.name}</h4>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[hsl(var(--text-muted))]">Tipo</span>
          <label className="flex items-center gap-2 text-sm text-[hsl(var(--text-muted))]">
            <input
              type="checkbox"
              checked={isMandatory}
              onChange={(e) => setIsMandatory(e.target.checked)}
              disabled={isSaving}
              className="h-4 w-4 rounded"
            />
            Obrigatória
          </label>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[hsl(var(--text-muted))]">Peso</span>
          <input
            type="number"
            min="0"
            max="10"
            step="0.1"
            value={weight}
            onChange={(e) => setWeight(Number(e.target.value))}
            disabled={isSaving}
            className="ui-input h-9 rounded px-3 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[hsl(var(--text-muted))]">Nível mín.</span>
          <select
            value={level ?? ""}
            onChange={(e) => setLevel(e.target.value || null)}
            disabled={isSaving}
            className="ui-input h-9 rounded px-3 text-sm"
          >
            <option value="">—</option>
            <option value="intern">Estagiário</option>
            <option value="junior">Júnior</option>
            <option value="mid">Pleno</option>
            <option value="senior">Sênior</option>
            <option value="lead">Lead</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[hsl(var(--text-muted))]">Anos mín.</span>
          <input
            type="number"
            min="0"
            max="50"
            step="0.5"
            value={years ?? ""}
            onChange={(e) => setYears(e.target.value ? Number(e.target.value) : null)}
            disabled={isSaving}
            placeholder="—"
            className="ui-input h-9 rounded px-3 text-sm"
          />
        </label>
      </div>

      <div className="flex gap-2 pt-2">
        <Button
          type="button"
          disabled={isSaving}
          onClick={() => {
            onAdd({
              skill_id: selectedSkill.id,
              is_mandatory: isMandatory,
              minimum_level: level,
              minimum_years: years,
              weight,
            });
          }}
          className="flex-1"
        >
          <Check className="h-4 w-4 mr-2" />
          Adicionar
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isSaving}
          onClick={onCancel}
          className="flex-1"
        >
          Cancelar
        </Button>
      </div>
    </div>
  );
}

// Main component
export function JobSkillsKanban({
  jobId,
  jobSkills,
  allSkills,
  pendingSkills,
  onAddPending,
  onRemovePending,
  onUpdatePending,
  onSkillAdded,
  onSkillUpdated,
}: JobSkillsKanbanProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedForAdd, setSelectedForAdd] = useState<Skill | null>(null);
  const [savingSkillId, setSavingSkillId] = useState<string | null>(null);

  // Merge job skills + pending skills
  const allLinkedSkills = useMemo(() => {
    const linked = [...jobSkills];
    const pendingMap = new Map(pendingSkills.map((s) => [s.skill_id, s]));
    pendingSkills.forEach((ps) => {
      if (!linked.some((js) => js.skill_id === ps.skill_id)) {
        linked.push({
          id: `pending-${ps.skill_id}`,
          job_id: jobId || "temp",
          skill_id: ps.skill_id,
          skill_name: ps.skill_name,
          is_mandatory: ps.is_mandatory,
          minimum_level: ps.minimum_level,
          minimum_years: ps.minimum_years,
          weight: ps.weight,
        });
      }
    });
    return linked;
  }, [jobSkills, pendingSkills, jobId]);

  const mandatory = allLinkedSkills.filter((s) => s.is_mandatory);
  const optional = allLinkedSkills.filter((s) => !s.is_mandatory);
  const linkedSkillIds = new Set(allLinkedSkills.map((s) => s.skill_id));
  const filteredBank = allSkills.filter(
    (s) =>
      !linkedSkillIds.has(s.id) &&
      s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Alerts
  const alerts = useMemo(() => {
    const issues: { level: "warning" | "info"; message: string }[] = [];

    if (mandatory.length === 0) {
      issues.push({
        level: "warning",
        message: "Nenhuma skill obrigatória definida — isso reduz a precisão do ranking.",
      });
    }

    if (mandatory.length > 8) {
      issues.push({
        level: "warning",
        message: "Muitas skills obrigatórias podem tornar a vaga difícil de preencher.",
      });
    }

    mandatory.forEach((s) => {
      if (s.weight < 0.5) {
        issues.push({
          level: "warning",
          message: `Skill "${s.skill_name}" é obrigatória, mas tem peso muito baixo (${s.weight}).`,
        });
      }
    });

    if (allLinkedSkills.length > 12) {
      issues.push({
        level: "info",
        message: "Considere priorizar as skills mais importantes.",
      });
    }

    return issues;
  }, [mandatory, allLinkedSkills]);

  async function handleSkillAdded(skill: Skill, config: Omit<PendingJobSkill, "skill_name" | "skill_category" | "skill_aliases">) {
    if (jobId) {
      setSavingSkillId(skill.id);
      try {
        await skillsService.addJobSkill(jobId, {
          skill_id: skill.id,
          is_mandatory: config.is_mandatory,
          minimum_level: config.minimum_level ?? undefined,
          minimum_years: config.minimum_years ?? undefined,
          weight: config.weight,
        });
        toast.success(`${skill.name} adicionada à vaga`);
        onSkillAdded();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao adicionar skill");
      } finally {
        setSavingSkillId(null);
        setSelectedForAdd(null);
      }
    } else {
      // Pending mode
      onAddPending({
        skill_id: skill.id,
        skill_name: skill.name,
        skill_category: skill.category,
        skill_aliases: skill.aliases,
        ...config,
      });
      setSelectedForAdd(null);
    }
  }

  async function handleSkillToggleMandatory(skill: JobSkill | PendingJobSkill) {
    const isJobSkill = "id" in skill && !skill.id.startsWith("pending-");

    if (isJobSkill && jobId) {
      setSavingSkillId(skill.skill_id);
      try {
        await skillsService.updateJobSkill(jobId, skill.skill_id, {
          is_mandatory: !skill.is_mandatory,
          minimum_level: skill.minimum_level,
          minimum_years: skill.minimum_years,
          weight: skill.weight,
        });
        toast.success("Skill movida com sucesso");
        onSkillUpdated();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao mover skill");
      } finally {
        setSavingSkillId(null);
      }
    } else {
      // Pending mode
      onUpdatePending(skill.skill_id, { is_mandatory: !skill.is_mandatory });
    }
  }

  async function handleSkillRemove(skill: JobSkill | PendingJobSkill) {
    const isJobSkill = "id" in skill && !skill.id.startsWith("pending-");

    if (isJobSkill && jobId) {
      setSavingSkillId(skill.skill_id);
      try {
        await skillsService.removeJobSkill(jobId, skill.skill_id);
        toast.success("Skill removida");
        onSkillUpdated();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao remover skill");
      } finally {
        setSavingSkillId(null);
      }
    } else {
      // Pending mode
      onRemovePending(skill.skill_id);
    }
  }

  async function handleSkillUpdateConfig(
    skill: JobSkill | PendingJobSkill,
    patch: Partial<Omit<JobSkill, "id" | "job_id">>
  ) {
    const isJobSkill = "id" in skill && !skill.id.startsWith("pending-");

    if (isJobSkill && jobId) {
      setSavingSkillId(skill.skill_id);
      try {
        await skillsService.updateJobSkill(jobId, skill.skill_id, {
          is_mandatory: patch.is_mandatory ?? skill.is_mandatory,
          minimum_level: patch.minimum_level ?? skill.minimum_level,
          minimum_years: patch.minimum_years ?? skill.minimum_years,
          weight: patch.weight ?? skill.weight,
        });
        onSkillUpdated();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao atualizar skill");
      } finally {
        setSavingSkillId(null);
      }
    } else {
      // Pending mode
      onUpdatePending(skill.skill_id, patch);
    }
  }

  return (
    <div className="space-y-4">
      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert, idx) => (
            <div
              key={idx}
              className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
                alert.level === "warning"
                  ? "border-[hsl(var(--warning))]/20 bg-[hsl(var(--warning-soft))] text-[hsl(var(--warning))]"
                  : "border-[hsl(var(--info))]/20 bg-[hsl(var(--info-soft))] text-[hsl(var(--info))]"
              }`}
            >
              <span className="font-bold">
                {alert.level === "warning" ? "⚠" : "ℹ"}
              </span>
              <span>{alert.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Bank search */}
      <div>
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium text-[hsl(var(--text))]">Buscar skills</span>
          <input
            type="text"
            placeholder="Procurar por nome…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="ui-input h-10 rounded-md px-3"
          />
        </label>
      </div>

      {/* Add form (if selected) */}
      {selectedForAdd && (
        <AddSkillForm
          skill={selectedForAdd}
          isSaving={savingSkillId === selectedForAdd.id}
          onAdd={(config) => handleSkillAdded(selectedForAdd, config)}
          onCancel={() => setSelectedForAdd(null)}
        />
      )}

      {/* Three-column kanban */}
      <div className="grid grid-cols-3 gap-4 min-h-[300px]">
        {/* Bank column */}
        <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/35 p-4">
          <h3 className="mb-3 text-sm font-semibold text-[hsl(var(--text))]">
            Banco de Skills
            {filteredBank.length > 0 && (
              <span className="ml-2 text-xs text-[hsl(var(--text-muted))]">
                ({filteredBank.length})
              </span>
            )}
          </h3>
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {filteredBank.length === 0 ? (
              <div className="text-sm text-[hsl(var(--text-muted))]">
                {linkedSkillIds.size === 0
                  ? "Nenhuma skill disponível"
                  : "Todas as skills já foram adicionadas"}
              </div>
            ) : (
              filteredBank.map((skill) => (
                <SkillBankCard
                  key={skill.id}
                  skill={skill}
                  isLinked={false}
                  onSelectToAdd={(mandatory) => {
                    setSelectedForAdd(skill);
                  }}
                />
              ))
            )}
          </div>
        </div>

        {/* Mandatory column */}
        <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/35 p-4">
          <h3 className="mb-3 text-sm font-semibold text-[hsl(var(--text))]">
            Obrigatórias
            <span className="ml-2 text-xs font-normal text-[hsl(var(--text-muted))]">
              ({mandatory.length})
            </span>
          </h3>
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {mandatory.length === 0 ? (
              <div className="text-sm text-[hsl(var(--text-muted))]">
                Nenhuma skill obrigatória
              </div>
            ) : (
              mandatory.map((skill) => (
                <LinkedSkillCard
                  key={skill.skill_id}
                  skill={skill}
                  isMandatory={true}
                  isEditing={false}
                  isSaving={savingSkillId === skill.skill_id}
                  onToggleMandatory={() => handleSkillToggleMandatory(skill)}
                  onRemove={() => handleSkillRemove(skill)}
                  onUpdateWeight={(w) => handleSkillUpdateConfig(skill, { weight: w })}
                  onUpdateLevel={(l) => handleSkillUpdateConfig(skill, { minimum_level: l })}
                  onUpdateYears={(y) => handleSkillUpdateConfig(skill, { minimum_years: y })}
                />
              ))
            )}
          </div>
        </div>

        {/* Optional column */}
        <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/35 p-4">
          <h3 className="mb-3 text-sm font-semibold text-[hsl(var(--text))]">
            Desejáveis
            <span className="ml-2 text-xs font-normal text-[hsl(var(--text-muted))]">
              ({optional.length})
            </span>
          </h3>
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {optional.length === 0 ? (
              <div className="text-sm text-[hsl(var(--text-muted))]">
                Nenhuma skill desejável
              </div>
            ) : (
              optional.map((skill) => (
                <LinkedSkillCard
                  key={skill.skill_id}
                  skill={skill}
                  isMandatory={false}
                  isEditing={false}
                  isSaving={savingSkillId === skill.skill_id}
                  onToggleMandatory={() => handleSkillToggleMandatory(skill)}
                  onRemove={() => handleSkillRemove(skill)}
                  onUpdateWeight={(w) => handleSkillUpdateConfig(skill, { weight: w })}
                  onUpdateLevel={(l) => handleSkillUpdateConfig(skill, { minimum_level: l })}
                  onUpdateYears={(y) => handleSkillUpdateConfig(skill, { minimum_years: y })}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
