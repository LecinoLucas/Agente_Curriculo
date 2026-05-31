import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Info, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { skillsService, type SkillCatalog } from "@/services/skillsService";
import type { JobSkill } from "@/types/domain";
import type { PendingJobSkill } from "../jobFormConfig";
import { useAuth } from "@/features/auth/useAuth";
import { CreateSkillModal } from "./CreateSkillModal";
import { toast } from "@/shared/utils/toast";

type SkillItem = {
  key: string;
  name: string;
  priority: "priority" | "complementary";
  checked: boolean;
  status: "loading" | "found" | "not_found" | "already_added" | "pending_validation";
  skill: SkillCatalog | null;
};

export type ApplicableSkill = {
  name: string;
  skill_id: string;
  skill: SkillCatalog;
  priority: "priority" | "complementary";
};

interface AiSkillSuggestionsBlockProps {
  mandatory: string[];
  optional: string[];
  linkedSkills?: Array<JobSkill | PendingJobSkill>;
  onApply: (selected: ApplicableSkill[]) => void | Promise<void>;
  onDismiss: () => void;
}

const EMPTY_LINKED_SKILLS: Array<JobSkill | PendingJobSkill> = [];

function normalizeSkillName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function getSuggestedAliases(skillName: string): string {
  const map: Record<string, string> = {
    "atendimento ao cliente": "Atendimento, Atendimento ao público, Relacionamento com cliente, Experiência do cliente",
    "responsabilidade com caixa": "Operação de caixa, Fechamento de caixa, Controle de valores, Manuseio de dinheiro",
    "rotina operacional": "Operação de pista, Procedimentos operacionais, Rotina de posto, Organização operacional",
    "experiencia em posto de combustivel": "Posto de combustível, Atendimento em pista, Abastecimento, Operação de posto",
    "venda adicional na pista": "Venda adicional, Oferta de produtos, Venda consultiva, Abordagem comercial",
  };
  const normalized = normalizeSkillName(skillName);
  if (map[normalized]) return map[normalized];
  return skillName;
}

function buildItems(mandatory: string[], optional: string[]): SkillItem[] {
  const seen = new Set<string>();
  const items: SkillItem[] = [];

  for (const [source, priority] of [
    [mandatory, "priority" as const],
    [optional, "complementary" as const],
  ] as const) {
    for (const rawName of source) {
      const name = rawName.trim();
      const normalized = normalizeSkillName(name);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      items.push({
        key: `${priority}:${normalized}`,
        name,
        priority,
        checked: false,
        status: "loading",
        skill: null,
      });
    }
  }

  return items;
}

function findExactSkillMatch(name: string, candidates: SkillCatalog[]): SkillCatalog | null {
  const normalizedName = normalizeSkillName(name);
  return (
    candidates.find((skill) => {
      if (normalizeSkillName(skill.name) === normalizedName) return true;
      if (normalizeSkillName(skill.normalized_name) === normalizedName) return true;
      return skill.aliases.some((alias) => normalizeSkillName(alias.alias) === normalizedName || normalizeSkillName(alias.normalized_alias) === normalizedName);
    }) ?? null
  );
}

function isAlreadyLinked(
  itemName: string,
  skill: SkillCatalog | null,
  linkedSkills: Array<JobSkill | PendingJobSkill>,
): boolean {
  const normalizedName = normalizeSkillName(itemName);
  return linkedSkills.some((linked) => {
    if (skill && linked.skill_id === skill.id) return true;
    return normalizeSkillName(linked.skill_name) === normalizedName;
  });
}

function getStatusLabel(status: SkillItem["status"]): string {
  if (status === "found") return "Encontrada no catálogo";
  if (status === "already_added") return "Já adicionada";
  if (status === "not_found") return "Não encontrada";
  if (status === "pending_validation") return "Aguardando validação";
  return "Validando catálogo";
}

function getStatusClasses(status: SkillItem["status"]): string {
  if (status === "found") return "bg-success-soft text-success";
  if (status === "already_added") return "bg-surface-muted text-text-muted";
  if (status === "not_found") return "bg-warning-soft text-warning";
  if (status === "pending_validation") return "bg-warning-soft text-warning";
  return "bg-surface-muted text-text-muted";
}

export function AiSkillSuggestionsBlock({
  mandatory,
  optional,
  linkedSkills = EMPTY_LINKED_SKILLS,
  onApply,
  onDismiss,
}: AiSkillSuggestionsBlockProps) {
  const initialItems = useMemo(() => buildItems(mandatory, optional), [mandatory, optional]);
  const [items, setItems] = useState<SkillItem[]>(initialItems);
  const [applying, setApplying] = useState(false);
  const [resolving, setResolving] = useState(false);

  const { user } = useAuth();
  const canCreateSkill = user?.role === "admin" || user?.role === "recruiter";
  const [creatingSkillItem, setCreatingSkillItem] = useState<SkillItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    setItems(initialItems);

    if (initialItems.length === 0) return;

    setResolving(true);
    void Promise.all(
      initialItems.map(async (item) => {
        try {
          const response = await skillsService.listSkills({
            search: item.name,
            page_size: 10,
            is_active: true,
          });
          const skill = findExactSkillMatch(item.name, response.data);
          if (!skill) {
            return { ...item, checked: false, status: "not_found" as const, skill: null };
          }
          if (isAlreadyLinked(item.name, skill, linkedSkills)) {
            return { ...item, checked: false, status: "already_added" as const, skill };
          }
          return { ...item, checked: true, status: "found" as const, skill };
        } catch {
          return { ...item, checked: false, status: "pending_validation" as const, skill: null };
        }
      }),
    )
      .then((resolvedItems) => {
        if (!cancelled) setItems(resolvedItems);
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });

    return () => {
      cancelled = true;
    };
  }, [initialItems, linkedSkills]);

  const mandatoryItems = items.filter((i) => i.priority === "priority");
  const optionalItems = items.filter((i) => i.priority === "complementary");
  const selectedApplicableItems = items.filter((i) => i.checked && i.status === "found" && i.skill);
  const anyChecked = selectedApplicableItems.length > 0;

  function toggle(key: string) {
    setItems((prev) =>
      prev.map((i) => {
        if (i.key !== key) return i;
        if (i.status !== "found") return i;
        return { ...i, checked: !i.checked };
      }),
    );
  }

  async function handleApply() {
    const selected = selectedApplicableItems.map((i) => ({
      name: i.skill?.name ?? i.name,
      skill_id: i.skill!.id,
      skill: i.skill!,
      priority: i.priority,
    }));
    if (selected.length === 0) {
      onDismiss();
      return;
    }
    setApplying(true);
    try {
      await onApply(selected);
    } finally {
      setApplying(false);
    }
  }

  return (
    <div
      className="rounded-2xl border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.04)] p-4 space-y-3"
      data-testid="ai-skill-suggestions"
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" />
        <p className="text-sm font-semibold text-text">Skills sugeridas pela IA</p>
      </div>

      {/* Warning */}
      <div className="flex items-start gap-2 rounded-xl bg-surface-muted px-3 py-2">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-text-muted" aria-hidden="true" />
        <p className="text-xs text-text-muted">
          A IA sugere as skills, mas o RH precisa confirmar antes de salvar.
        </p>
      </div>

      {/* Mandatory skills */}
      {mandatoryItems.length > 0 && (
        <div>
          <p
            className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted"
            data-testid="ai-suggestions-mandatory-label"
          >
            Obrigatórias ({mandatoryItems.length})
          </p>
          <ul className="space-y-1.5" data-testid="ai-suggestions-mandatory-list">
            {mandatoryItems.map((item) => (
              <li key={item.key} className="flex flex-wrap items-center gap-2">
                <input
                  type="checkbox"
                  id={`ai-skill-${item.key}`}
                  checked={item.checked}
                  onChange={() => toggle(item.key)}
                  disabled={item.status !== "found"}
                  className="h-3.5 w-3.5 rounded"
                  data-testid={`ai-skill-checkbox-${item.name}`}
                />
                <label
                  htmlFor={`ai-skill-${item.key}`}
                  className="flex items-center gap-1.5 text-xs text-text cursor-pointer"
                >
                  {item.name}
                  <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${getStatusClasses(item.status)}`}>
                    {item.status === "loading" ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : null}
                    {item.status === "found" ? <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> : null}
                    {item.status === "not_found" || item.status === "pending_validation" ? <AlertCircle className="h-3 w-3" aria-hidden="true" /> : null}
                    {getStatusLabel(item.status)}
                  </span>
                </label>
                {item.status === "not_found" && canCreateSkill && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] ml-auto text-[hsl(var(--primary))]"
                    onClick={() => setCreatingSkillItem(item)}
                    data-testid={`create-skill-btn-${item.name}`}
                  >
                    + Criar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Optional (nice-to-have) skills */}
      {optionalItems.length > 0 && (
        <div>
          <p
            className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted"
            data-testid="ai-suggestions-optional-label"
          >
            Diferenciais ({optionalItems.length})
          </p>
          <ul className="space-y-1.5" data-testid="ai-suggestions-optional-list">
            {optionalItems.map((item) => (
              <li key={item.key} className="flex flex-wrap items-center gap-2">
                <input
                  type="checkbox"
                  id={`ai-skill-${item.key}`}
                  checked={item.checked}
                  onChange={() => toggle(item.key)}
                  disabled={item.status !== "found"}
                  className="h-3.5 w-3.5 rounded"
                  data-testid={`ai-skill-checkbox-${item.name}`}
                />
                <label
                  htmlFor={`ai-skill-${item.key}`}
                  className="flex items-center gap-1.5 text-xs text-text cursor-pointer"
                >
                  {item.name}
                  <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${getStatusClasses(item.status)}`}>
                    {item.status === "loading" ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : null}
                    {item.status === "found" ? <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> : null}
                    {item.status === "not_found" || item.status === "pending_validation" ? <AlertCircle className="h-3 w-3" aria-hidden="true" /> : null}
                    {getStatusLabel(item.status)}
                  </span>
                </label>
                {item.status === "not_found" && canCreateSkill && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] ml-auto text-[hsl(var(--primary))]"
                    onClick={() => setCreatingSkillItem(item)}
                    data-testid={`create-skill-btn-${item.name}`}
                  >
                    + Criar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 border-t border-[hsl(var(--primary)/0.15)] pt-3">
        <Button
          type="button"
          size="sm"
          onClick={() => void handleApply()}
          disabled={applying || resolving || !anyChecked}
          data-testid="ai-suggestions-apply"
        >
          {applying ? "Aplicando..." : resolving ? "Validando..." : "Aplicar skills selecionadas"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onDismiss}
          disabled={applying}
          data-testid="ai-suggestions-dismiss"
        >
          Ignorar sugestões
        </Button>
      </div>

      <CreateSkillModal
        open={creatingSkillItem !== null}
        initialName={creatingSkillItem?.name ?? ""}
        initialAliases={creatingSkillItem ? getSuggestedAliases(creatingSkillItem.name) : ""}
        onClose={() => setCreatingSkillItem(null)}
        onSuccess={(createdSkill) => {
          setItems((prev) =>
            prev.map((i) => {
              if (i.key === creatingSkillItem?.key) {
                return { ...i, status: "found", checked: true, skill: createdSkill };
              }
              return i;
            })
          );
          setCreatingSkillItem(null);
          toast.success("Skill criada e selecionada.");
        }}
      />
    </div>
  );
}
