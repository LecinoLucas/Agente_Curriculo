import { useState } from "react";
import { X, Eye, Download, Clock, Layers, HelpCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BUNDLED_TEMPLATES,
  countTemplateQuestions,
  type RawTemplate,
} from "./templateImporter";
import { CandidatePreviewModal } from "./CandidatePreviewModal";

type Props = {
  onClose: () => void;
  onImport: (template: RawTemplate) => Promise<void>;
  importingName: string | null;
};

const CATEGORY_COLORS: Record<string, string> = {
  "Avaliação Comportamental — Administrativo e Atendimento": "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  "Avaliação Comportamental — Operacional e Postos":         "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  "Avaliação Comportamental — Liderança e Gestão":           "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  "Avaliação Comportamental — Tecnologia e Suporte":         "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
  "Avaliação Comportamental — Aprendizagem e Adaptabilidade":"bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
};

function categoryTag(name: string): string {
  if (name.includes("Administrativo")) return "Administrativo";
  if (name.includes("Operacional")) return "Operacional";
  if (name.includes("Liderança")) return "Liderança";
  if (name.includes("Tecnologia")) return "Tecnologia";
  if (name.includes("Aprendizagem")) return "Aprendizagem";
  return "Geral";
}

export function TemplateGalleryModal({ onClose, onImport, importingName }: Props) {
  const [previewTemplate, setPreviewTemplate] = useState<RawTemplate | null>(null);

  if (previewTemplate) {
    return (
      <CandidatePreviewModal
        template={previewTemplate}
        onClose={() => setPreviewTemplate(null)}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm">
      <div className="my-8 w-full max-w-4xl rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] shadow-2xl">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[hsl(var(--border))] px-6 py-5">
          <div>
            <h2 className="text-xl font-bold text-[hsl(var(--text))]">Modelos prontos</h2>
            <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">
              Selecione um modelo para criar um rascunho editável. Você poderá personalizar antes de ativar.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={importingName !== null}
            className="shrink-0 rounded-xl p-2 text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--accent-soft))] hover:text-[hsl(var(--text))] disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Compliance note */}
        <div className="mx-6 mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <HelpCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Estes modelos são avaliações comportamentais operacionais, não testes psicológicos.
            Use os resultados como apoio à decisão, nunca como critério único de contratação.
          </p>
        </div>

        {/* Template grid */}
        <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
          {BUNDLED_TEMPLATES.map((template) => {
            const isImporting = importingName === template.name;
            const totalQ = countTemplateQuestions(template);
            const colorClass = CATEGORY_COLORS[template.name] ?? "bg-gray-100 text-gray-800";

            return (
              <div
                key={template.name}
                className={cn(
                  "flex flex-col rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--bg))] p-5 transition-shadow",
                  isImporting ? "opacity-80" : "hover:shadow-md",
                )}
              >
                {/* Category badge */}
                <span className={cn("mb-3 w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold", colorClass)}>
                  {categoryTag(template.name)}
                </span>

                {/* Name */}
                <h3 className="text-sm font-bold leading-snug text-[hsl(var(--text))]">
                  {template.name.replace("Avaliação Comportamental — ", "")}
                </h3>
                <p className="mt-1.5 line-clamp-3 text-xs text-[hsl(var(--text-muted))]">
                  {template.description}
                </p>

                {/* Meta */}
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-[hsl(var(--text-muted))]">
                  <span className="flex items-center gap-1">
                    <Layers className="h-3.5 w-3.5" />
                    {template.competencies.length} competências
                  </span>
                  <span className="flex items-center gap-1">
                    <HelpCircle className="h-3.5 w-3.5" />
                    {totalQ} perguntas
                  </span>
                  {template.estimated_minutes && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      ~{template.estimated_minutes} min
                    </span>
                  )}
                </div>

                {/* Competency list */}
                <ul className="mt-3 space-y-0.5 border-t border-[hsl(var(--border))] pt-3">
                  {template.competencies.map((c) => (
                    <li key={c.key} className="flex items-center gap-1.5 text-xs text-[hsl(var(--text-muted))]">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--primary))]" />
                      {c.name}
                    </li>
                  ))}
                </ul>

                {/* Actions */}
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewTemplate(template)}
                    disabled={importingName !== null}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-[hsl(var(--border))] px-3 py-2 text-xs font-medium text-[hsl(var(--text-muted))] transition-colors hover:bg-[hsl(var(--accent-soft))] hover:text-[hsl(var(--text))] disabled:opacity-40"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Preview
                  </button>
                  <button
                    type="button"
                    onClick={() => onImport(template)}
                    disabled={importingName !== null}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-colors",
                      isImporting
                        ? "bg-[hsl(var(--primary))]/60 text-white"
                        : "bg-[hsl(var(--primary))] text-white hover:bg-[hsl(var(--primary))]/90 disabled:opacity-40",
                    )}
                  >
                    {isImporting ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Importando…
                      </>
                    ) : (
                      <>
                        <Download className="h-3.5 w-3.5" />
                        Usar modelo
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-[hsl(var(--border))] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={importingName !== null}
            className="rounded-xl border border-[hsl(var(--border))] px-4 py-2 text-sm font-medium text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--accent-soft))] hover:text-[hsl(var(--text))] disabled:opacity-40"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
