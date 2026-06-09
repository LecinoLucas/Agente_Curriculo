import type { ReactNode } from "react";
import { AlertCircle, Info } from "lucide-react";
import type { AiAssistantResponse } from "../types";
import { friendlyError, presentResult } from "../utils/aiAssistantPresenters";
import { AiAssistantWarnings } from "./AiAssistantWarnings";

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2 rounded-lg border border-border/70 bg-[hsl(var(--bg))]/60 p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</h3>
      {children}
    </section>
  );
}

function EmptySection({ text }: { text: string }) {
  return <p className="text-sm text-text-muted">{text}</p>;
}

export function AiAssistantResultRenderer({ result }: { result: AiAssistantResponse }) {
  const presented = presentResult(result);
  const errorMessage = !result.ok ? friendlyError(result.error_code, result.message) : null;

  return (
    <div className="space-y-4" data-testid="ai-assistant-result">
      {!result.ok && (
        <div
          className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/5 p-3"
          data-error-code={result.error_code ?? undefined}
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <div className="space-y-2">
            <p className="break-words text-sm text-danger">{errorMessage}</p>
            {result.intent === "knowledge.answer" && (
              <p className="text-xs text-danger/80">
                As fontes recuperadas, se existirem, continuam disponíveis em &quot;Buscar fontes&quot;.
              </p>
            )}
          </div>
        </div>
      )}

      <Section title={presented.title}>
        {presented.summary && presented.summary.length > 0 ? (
          <div className="space-y-2">
            {presented.summary.map((line) => (
              <p key={line} className="whitespace-pre-wrap text-sm leading-6 text-text">
                {line}
              </p>
            ))}
          </div>
        ) : (
          <EmptySection text="Sem dados para exibir." />
        )}
        {presented.source && (
          <p className="mt-2 text-right text-[10px] font-medium uppercase tracking-widest text-text-muted/60">
            {presented.source}
          </p>
        )}
      </Section>

      {presented.metrics && presented.metrics.length > 0 && (
        <Section title={result.intent.startsWith("job.") ? "Dados cadastrados" : "Evidências"}>
          <dl className="grid gap-2 sm:grid-cols-2">
            {presented.metrics.map((metric) => (
              <div key={metric.label} className="rounded-lg border border-border/70 bg-surface p-2">
                <dt className="text-xs uppercase tracking-wide text-text-muted">{metric.label}</dt>
                <dd className="mt-1 text-sm text-text">{metric.value}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      {presented.evidence && presented.evidence.length > 0 && (
        <Section title={result.intent === "knowledge.search" ? "Fontes encontradas" : result.intent.startsWith("job.") ? "Informações detalhadas" : "Evidências"}>
          <div className="space-y-3">
            {presented.evidence.map((item) => (
              <article key={`${item.title}-${item.description ?? ""}`} className="rounded-lg border border-border/60 bg-surface p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-text">{item.title}</p>
                  {item.emphasis ? (
                    <span className="shrink-0 rounded-full bg-[hsl(var(--primary))]/10 px-2 py-0.5 text-[11px] font-semibold text-[hsl(var(--primary))]">
                      {item.emphasis}
                    </span>
                  ) : null}
                </div>
                {item.description ? (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-text-muted">{item.description}</p>
                ) : null}
              </article>
            ))}
          </div>
        </Section>
      )}

      {presented.pending && presented.pending.length > 0 && (
        <Section title="Pendências">
          <ul className="space-y-2">
            {presented.pending.map((item) => (
              <li key={item} className="text-sm text-text">
                {item}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {presented.nextStep && (
        <Section title="Próximo passo sugerido">
          <div className="flex items-start gap-2 rounded-lg bg-[hsl(var(--primary))]/8 p-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--primary))]" />
            <p className="text-sm text-text">{presented.nextStep}</p>
          </div>
        </Section>
      )}

      {presented.limitations && presented.limitations.length > 0 && (
        <Section title="Limitações">
          <ul className="space-y-2">
            {presented.limitations.map((item) => (
              <li key={item} className="text-sm text-text-muted">
                {item}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <AiAssistantWarnings warnings={presented.warningCodes} />
    </div>
  );
}
