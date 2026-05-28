import type { JobFormValues, SelectionFlowType } from "../jobFormConfig";
import { SELECTION_FLOW_DEFAULTS } from "../jobFormConfig";

interface Props {
  form: JobFormValues;
  onChange: (updates: Partial<JobFormValues>) => void;
}

const FLOW_TYPE_OPTIONS: { value: SelectionFlowType; label: string; description: string }[] = [
  { value: "simple", label: "Simples", description: "Sem gates obrigatórios. Ideal para processos ágeis ou indicações." },
  { value: "standard", label: "Padrão", description: "Avaliação comportamental + IA + entrevista + scorecard. Fluxo completo recomendado." },
  { value: "technical", label: "Técnico", description: "Entrevista + scorecard + revisão do gestor. Sem avaliação comportamental." },
  { value: "leadership", label: "Liderança", description: "Todos os gates obrigatórios incluindo revisão do gestor." },
];

const GATE_LABELS: { field: keyof typeof SELECTION_FLOW_DEFAULTS.standard; label: string; description: string }[] = [
  { field: "requires_behavioral_assessment", label: "Avaliação comportamental obrigatória", description: "Candidato deve completar a avaliação comportamental antes da decisão." },
  { field: "requires_behavioral_ai_evaluation", label: "IA comportamental obrigatória", description: "Avaliação de IA comportamental deve ser concluída. Aplica-se apenas quando avaliação comportamental é obrigatória." },
  { field: "requires_interview", label: "Entrevista obrigatória", description: "Deve haver entrevista com status concluída ou aguardando feedback." },
  { field: "requires_scorecard", label: "Scorecard obrigatório", description: "Scorecard de entrevista deve ser enviado antes da decisão." },
  { field: "requires_manager_review", label: "Revisão do gestor obrigatória", description: "Um comentário de um usuário com papel de gestor deve existir antes da decisão." },
];

export function JobAssessmentPolicyStep({ form, onChange }: Props) {
  function handleFlowTypeChange(flowType: SelectionFlowType) {
    onChange({
      selection_flow_type: flowType,
      ...SELECTION_FLOW_DEFAULTS[flowType],
    });
  }

  function handleGateToggle(field: keyof typeof SELECTION_FLOW_DEFAULTS.standard, value: boolean) {
    onChange({ [field]: value });
  }

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">
          Tipo de fluxo de seleção
        </label>
        <p className="text-xs text-[hsl(var(--muted-foreground))] mb-3">
          Selecione um tipo para preencher os gates automaticamente. Você pode ajustar individualmente após.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {FLOW_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleFlowTypeChange(opt.value)}
              className={[
                "text-left px-3 py-2.5 rounded-md border text-sm transition-colors",
                form.selection_flow_type === opt.value
                  ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.08)] text-[hsl(var(--primary))]"
                  : "border-border hover:border-[hsl(var(--primary)/0.5)] text-[hsl(var(--foreground))]",
              ].join(" ")}
            >
              <div className="font-medium">{opt.label}</div>
              <div className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{opt.description}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-[hsl(var(--foreground))] mb-3">Gates de decisão final</p>
        <div className="space-y-3">
          {GATE_LABELS.map(({ field, label, description }) => (
            <label key={field} className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={form[field] as boolean}
                onChange={(e) => handleGateToggle(field, e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-border text-[hsl(var(--primary))] focus:ring-[hsl(var(--primary))]"
              />
              <div>
                <span className="text-sm font-medium text-[hsl(var(--foreground))]">{label}</span>
                <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
