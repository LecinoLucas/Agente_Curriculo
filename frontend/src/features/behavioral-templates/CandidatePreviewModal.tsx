import { X, FileText, List, BarChart2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RawTemplate, RawTemplateQuestion } from "./templateImporter";
import { countTemplateQuestions } from "./templateImporter";

type Props = {
  template: RawTemplate;
  onClose: () => void;
};

function QuestionPreview({ q, index }: { q: RawTemplateQuestion; index: number }) {
  if (q.type === "text") {
    return (
      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--primary))]" />
          <p className="text-sm font-medium text-text">
            {index}. {q.prompt}
            {q.required && <span className="ml-1 text-danger">*</span>}
          </p>
        </div>
        <textarea
          disabled
          rows={4}
          placeholder="O candidato escreverá a resposta aqui usando o método STAR (Situação, Tarefa, Ação, Resultado)..."
          className="w-full resize-none rounded-lg border border-border bg-[hsl(var(--bg))] px-3 py-2 text-sm text-text-muted opacity-60"
        />
      </div>
    );
  }

  if (q.type === "scale") {
    const labels = q.scale?.labels ?? {};
    const min = q.scale?.min ?? 1;
    const max = q.scale?.max ?? 5;
    const steps = Array.from({ length: max - min + 1 }, (_, i) => min + i);
    return (
      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <BarChart2 className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--primary))]" />
          <p className="text-sm font-medium text-text">
            {index}. {q.prompt}
            {q.required && <span className="ml-1 text-danger">*</span>}
          </p>
        </div>
        <div className="flex gap-2">
          {steps.map((step) => (
            <label key={step} className="flex flex-1 cursor-not-allowed flex-col items-center gap-1">
              <input type="radio" disabled className="h-4 w-4 opacity-50" />
              <span className="text-xs font-semibold text-text">{step}</span>
              {labels[String(step)] && (
                <span className="text-center text-[10px] leading-tight text-text-muted">
                  {labels[String(step)]}
                </span>
              )}
            </label>
          ))}
        </div>
      </div>
    );
  }

  if (q.type === "multiple_choice") {
    return (
      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <List className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--primary))]" />
          <p className="text-sm font-medium text-text">
            {index}. {q.prompt}
            {q.required && <span className="ml-1 text-danger">*</span>}
          </p>
        </div>
        <div className="space-y-1.5 pl-6">
          {(q.options ?? []).map((opt) => (
            <label key={opt.key} className="flex cursor-not-allowed items-start gap-2 opacity-70">
              <input type="radio" disabled className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="text-sm text-text">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

export function CandidatePreviewModal({ template, onClose }: Props) {
  const totalQuestions = countTemplateQuestions(template);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm">
      <div className="my-8 w-full max-w-2xl rounded-2xl border border-border bg-surface shadow-2xl">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-text-muted">
              Preview — visão do candidato
            </p>
            <h2 className="mt-1 text-lg font-bold text-text">{template.name}</h2>
            <p className="mt-1 text-sm text-text-muted">{template.description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl p-2 text-text-muted hover:bg-[hsl(var(--accent-soft))] hover:text-text"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Meta */}
        <div className="flex gap-4 border-b border-border px-6 py-3 text-xs text-text-muted">
          <span>{template.competencies.length} competências</span>
          <span>{totalQuestions} perguntas</span>
          {template.estimated_minutes && <span>~{template.estimated_minutes} min</span>}
        </div>

        {/* Instructions */}
        {template.instructions_to_candidate && (
          <div className="mx-6 mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
            <p className="font-semibold">Instruções</p>
            <p className="mt-0.5">{template.instructions_to_candidate}</p>
          </div>
        )}

        {/* Competencies */}
        <div className="space-y-6 px-6 py-5">
          {template.competencies.map((comp, ci) => {
            const questionsBefore = template.competencies
              .slice(0, ci)
              .reduce((s, c) => s + c.questions.length, 0);

            return (
              <section key={comp.key}>
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[hsl(var(--primary))] text-xs font-bold text-white">
                    {ci + 1}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-text">{comp.name}</h3>
                    <p className="text-xs text-text-muted">{comp.description}</p>
                  </div>
                </div>
                <div className={cn(
                  "space-y-5 rounded-xl border border-border p-4",
                  "bg-[hsl(var(--bg))]",
                )}>
                  {comp.questions.map((q, qi) => (
                    <QuestionPreview key={q.key} q={q} index={questionsBefore + qi + 1} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-text-muted hover:bg-[hsl(var(--accent-soft))] hover:text-text"
          >
            Fechar preview
          </button>
        </div>
      </div>
    </div>
  );
}
