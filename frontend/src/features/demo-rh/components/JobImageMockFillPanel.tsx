import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Edit3,
  FileImage,
  FileText,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useState } from "react";

import type { JobFormValues } from "../../jobs/jobFormConfig";
import { toast } from "../../../shared/utils/toast";
import {
  DEMO_DESCRIPTION,
  MOCK_FILE_NAME,
  PRINCIPAL_FIELDS,
  ACTIVITIES,
  REQUIREMENTS,
  DIFFERENTIALS,
  BENEFITS,
  DEMO_MOCK_SKILLS,
  MOCK_JOB_FILL_UPDATES,
} from "../data/demoJobImageFill";

export { DEMO_MOCK_SKILLS, MOCK_JOB_FILL_UPDATES } from "../data/demoJobImageFill";

type SourceMode = "image" | "description";
type DemoStatus = "idle" | "loading" | "result";

const PROCESSING_DELAY_MS = 450;

type JobImageMockFillPanelProps = {
  mode?: "demo" | "form";
  hasFormData?: boolean;
  onApply?: (updates: Partial<JobFormValues>) => void;
  onDemoApply?: (updates: Partial<JobFormValues>) => void;
};

function Badge({ children, tone = "neutral" }: { children: string; tone?: "green" | "amber" | "neutral" }) {
  const toneClass =
    tone === "green"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-slate-200 bg-white text-slate-600";

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold ${toneClass}`}>
      {children}
    </span>
  );
}

function MockPoster() {
  return (
    <div className="relative overflow-hidden rounded-[22px] border border-[#8a1c31]/20 bg-[#7a1930] p-4 text-white shadow-[0_18px_34px_-28px_rgba(86,17,31,0.9)]">
      <div className="absolute right-0 top-0 h-24 w-24 rounded-bl-full bg-white/10" />
      <div className="relative">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/70">Grupo Marajó</p>
        <div className="mt-8 rounded-2xl bg-white/95 p-4 text-[#231f20]">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#8a1c31]">Estamos contratando</p>
          <h3 className="mt-2 text-2xl font-black leading-tight">Assistente Fiscal</h3>
          <p className="mt-2 text-xs font-semibold text-slate-600">Central de Notas · Jardim Goiás</p>
          <div className="mt-4 space-y-2 text-[11px] font-medium text-slate-600">
            <p>CLT · Presencial</p>
            <p>Seg a Sex · 08h às 18h</p>
            <p>R$ 2.258,57 + R$ 500 avaliação</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5 text-[10px] font-bold">
          <span className="rounded-full bg-white/15 px-2 py-1">Excel</span>
          <span className="rounded-full bg-white/15 px-2 py-1">ICMS</span>
          <span className="rounded-full bg-white/15 px-2 py-1">DIFAL</span>
        </div>
      </div>
    </div>
  );
}

function SourcePreview({ mode, description }: { mode: SourceMode; description: string }) {
  if (mode === "image") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-black text-slate-900">Imagem da vaga</h3>
          <Badge tone="green">Imagem processada</Badge>
        </div>
        <MockPoster />
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
          <p className="text-xs font-black text-slate-800">{MOCK_FILE_NAME}</p>
          <p className="mt-0.5 text-[11px] font-medium text-slate-500">PNG • 1.2 MB • Modo demo</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-black text-slate-900">Descrição usada</h3>
        <Badge tone="green">Descrição organizada</Badge>
      </div>
      <div className="max-h-[360px] overflow-y-auto rounded-[22px] border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
        {description}
      </div>
      <p className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-xs font-semibold text-slate-500">
        Fonte: descrição informada pelo RH
      </p>
    </div>
  );
}

export function JobImageMockFillPanel({ mode = "form", hasFormData = false, onApply, onDemoApply }: JobImageMockFillPanelProps) {
  const [sourceMode, setSourceMode] = useState<SourceMode>("image");
  const [status, setStatus] = useState<DemoStatus>("idle");
  const [hasExampleImage, setHasExampleImage] = useState(false);
  const [description, setDescription] = useState("");
  const [validation, setValidation] = useState("");
  const [processedMode, setProcessedMode] = useState<SourceMode>("image");

  const hasDescription = description.trim().length > 0;
  const loadingLabel = sourceMode === "image" ? "Processando imagem..." : "Organizando descrição...";
  const sourceBadge = processedMode === "image" ? "Imagem processada" : "Descrição organizada";

  function handleUseImageExample() {
    setValidation("");
    setHasExampleImage(true);
  }

  function handleUseDescriptionExample() {
    setValidation("");
    setDescription(DEMO_DESCRIPTION);
  }

  function handleGenerate() {
    if (!hasExampleImage && !hasDescription) {
      setValidation("Envie uma imagem ou descreva a vaga para simular o preenchimento.");
      return;
    }

    if (sourceMode === "image" && !hasExampleImage) {
      setValidation("Use uma imagem exemplo ou alterne para descrição.");
      return;
    }

    if (sourceMode === "description" && !hasDescription) {
      setValidation("Descreva a vaga para simular o preenchimento.");
      return;
    }

    setValidation("");
    setProcessedMode(sourceMode);
    setStatus("loading");
    window.setTimeout(() => setStatus("result"), PROCESSING_DELAY_MS);
  }

  function handleReset() {
    setStatus("idle");
    setValidation("");
    if (sourceMode === "image") {
      setHasExampleImage(false);
    } else {
      setDescription("");
    }
  }

  function handleApply() {
    if (mode === "demo") {
      onDemoApply?.(MOCK_JOB_FILL_UPDATES);
      return;
    }

    if (hasFormData && !window.confirm("Isso substituirá campos já preenchidos. Deseja continuar?")) {
      return;
    }

    onApply?.(MOCK_JOB_FILL_UPDATES);
    toast.success("Preenchimento aplicado. Revise os campos antes de salvar.");
  }

  function handleEditFields() {
    toast.info("Edição direta será habilitada na próxima fase.");
  }

  return (
    <section
      className="overflow-hidden rounded-[28px] border border-slate-200 bg-[#f5f7fb] shadow-[0_24px_70px_-54px_rgba(15,23,42,0.55)]"
      data-testid="job-image-mock-fill-panel"
    >
      <div className="border-b border-slate-200 bg-white px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[#8a1c31]">
              <Sparkles className="h-5 w-5" />
              <p className="text-xs font-black uppercase tracking-[0.18em]">Outros · Modo demo</p>
            </div>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
              Criar vaga a partir de imagem ou descrição
            </h2>
            <p className="mt-2 max-w-3xl text-sm font-medium leading-relaxed text-slate-500">
              Envie um cartaz ou descreva a vaga e visualize o preenchimento automático em modo demonstração.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="green">Modo demo</Badge>
            <Badge tone="green">Preenchimento simulado</Badge>
            <Badge tone="amber">Revisão humana obrigatória</Badge>
          </div>
        </div>
      </div>

      {status === "loading" ? (
        <div className="flex min-h-[520px] items-center justify-center px-6 py-14">
          <div className="rounded-[28px] border border-slate-200 bg-white px-10 py-9 text-center shadow-[0_24px_60px_-42px_rgba(15,23,42,0.5)]">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#8a1c31]/10 text-[#8a1c31]">
              <Loader2 className="h-7 w-7 animate-spin" />
            </div>
            <h3 className="mt-5 text-lg font-black text-slate-900" role="status">
              {loadingLabel}
            </h3>
            <p className="mt-2 max-w-sm text-sm font-medium text-slate-500">
              Os dados estão sendo organizados localmente para demonstrar a experiência de preenchimento.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-4 p-4 lg:grid-cols-[minmax(260px,0.9fr)_minmax(360px,1.55fr)_minmax(260px,0.85fr)] lg:p-5">
            <aside className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
              {status === "result" ? (
                <SourcePreview mode={processedMode} description={description} />
              ) : (
                <div className="space-y-5">
                  <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                    <h3 className="text-base font-black text-slate-900">Comece a simulação</h3>
                    <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">
                      Use um cartaz de vaga ou uma descrição livre para simular o preenchimento automático.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 rounded-2xl border border-slate-200 bg-slate-100 p-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSourceMode("image");
                        setValidation("");
                      }}
                      className={`flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-black transition ${
                        sourceMode === "image" ? "bg-white text-[#8a1c31] shadow-sm" : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      <FileImage className="h-4 w-4" />
                      Imagem
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSourceMode("description");
                        setValidation("");
                      }}
                      className={`flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-black transition ${
                        sourceMode === "description" ? "bg-white text-[#8a1c31] shadow-sm" : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      <FileText className="h-4 w-4" />
                      Descrição
                    </button>
                  </div>

                  {sourceMode === "image" ? (
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-sm font-black text-slate-900">Imagem da vaga</h3>
                        <p className="mt-1 text-sm font-medium leading-relaxed text-slate-500">
                          Use um cartaz, print ou arte de divulgação para simular a extração dos dados.
                        </p>
                      </div>
                      <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-4">
                        {hasExampleImage ? (
                          <div className="space-y-3">
                            <MockPoster />
                            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3">
                              <p className="text-xs font-black text-emerald-800">{MOCK_FILE_NAME}</p>
                              <p className="mt-0.5 text-[11px] font-bold text-emerald-700">
                                Imagem pronta para processamento
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex min-h-[270px] flex-col items-center justify-center text-center">
                            <FileImage className="h-10 w-10 text-slate-300" />
                            <p className="mt-3 text-sm font-black text-slate-800">Nenhuma imagem selecionada</p>
                            <p className="mt-1 max-w-[220px] text-xs font-medium text-slate-500">
                              Nesta fase, use o exemplo visual para demonstrar a extração.
                            </p>
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={handleUseImageExample}
                        className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-[#8a1c31]/20 bg-white px-4 text-sm font-black text-[#8a1c31] shadow-sm transition hover:bg-[#8a1c31]/5"
                      >
                        Usar exemplo de imagem
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <label htmlFor="mock-job-description" className="text-sm font-black text-slate-900">
                        Descreva a vaga
                      </label>
                      <textarea
                        id="mock-job-description"
                        value={description}
                        onChange={(event) => {
                          setDescription(event.target.value);
                          setValidation("");
                        }}
                        placeholder="Ex.: Preciso contratar Assistente Fiscal para a Central de Notas. A pessoa vai lançar notas fiscais, conferir ICMS e DIFAL, organizar arquivos digitais e precisa ter Excel básico."
                        className="min-h-[300px] w-full resize-none rounded-[20px] border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#8a1c31]/40 focus:bg-white focus:ring-2 focus:ring-[#8a1c31]/10"
                      />
                      <button
                        type="button"
                        onClick={handleUseDescriptionExample}
                        className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-[#8a1c31]/20 bg-white px-4 text-sm font-black text-[#8a1c31] shadow-sm transition hover:bg-[#8a1c31]/5"
                      >
                        Usar descrição exemplo
                      </button>
                    </div>
                  )}

                  {validation && (
                    <div
                      role="alert"
                      className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm font-bold text-amber-800"
                    >
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      {validation}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleGenerate}
                    className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-[#8a1c31] px-5 text-sm font-black text-white shadow-[0_14px_26px_-18px_rgba(86,17,31,0.9)] transition hover:bg-[#6f1727]"
                  >
                    Gerar preenchimento simulado
                  </button>
                </div>
              )}
            </aside>

            <div
              aria-label="Dados preenchidos da vaga"
              className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm lg:p-5"
              role="region"
            >
              {status === "result" ? (
                <div className="space-y-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-lg font-black text-slate-950">Dados principais</h3>
                      <p className="mt-1 text-sm font-medium text-slate-500">Sugestões prontas para revisão.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge tone="green">{sourceBadge}</Badge>
                      <Badge tone="green">Campos preenchidos</Badge>
                      <Badge tone="amber">Revisão recomendada</Badge>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {PRINCIPAL_FIELDS.map(([label, value]) => (
                      <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                        <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">{label}</p>
                        <p className="mt-1 text-sm font-black text-slate-900">{value}</p>
                      </div>
                    ))}
                  </div>

                  <section>
                    <h4 className="text-sm font-black text-slate-900">Descrição da vaga</h4>
                    <p className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
                      Buscamos um(a) Assistente Fiscal para atuar na Central de Notas, apoiando lançamentos fiscais, conferências tributárias e organização de documentos para auditoria. A pessoa atuará com análise de retenções, conferência de ICMS e DIFAL e suporte ao fluxo fiscal da operação, com foco em organização, atenção aos detalhes e domínio básico de Excel.
                    </p>
                  </section>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <ListSection title="Atividades principais" items={ACTIVITIES} />
                    <ListSection title="Requisitos" items={REQUIREMENTS} />
                    <ListSection title="Diferenciais" items={DIFFERENTIALS} />
                    <ListSection title="Benefícios" items={BENEFITS} />
                  </div>

                  <section>
                    <h4 className="text-sm font-black text-slate-900">Skills sugeridas</h4>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {DEMO_MOCK_SKILLS.map((skill) => (
                        <span
                          key={skill}
                          className="rounded-full border border-[#8a1c31]/15 bg-[#8a1c31]/5 px-3 py-1.5 text-xs font-black text-[#8a1c31]"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                    <p className="mt-3 text-sm font-medium text-slate-500">Sugestões prontas para revisão.</p>
                  </section>
                </div>
              ) : (
                <div className="flex min-h-[520px] items-center justify-center rounded-[22px] border border-dashed border-slate-300 bg-slate-50 text-center">
                  <div className="max-w-sm px-6">
                    <ClipboardCheck className="mx-auto h-10 w-10 text-slate-300" />
                    <h3 className="mt-4 text-lg font-black text-slate-900">Dados simulados aparecerão aqui</h3>
                    <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">
                      Escolha uma imagem ou descrição e gere o preenchimento para visualizar o mock completo.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <aside className="space-y-4">
              <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-black text-slate-900">Resumo da extração</h3>
                <div className="mt-4 rounded-[22px] border border-emerald-200 bg-emerald-50 p-4 text-center">
                  <p className="text-3xl font-black text-emerald-700">18/20</p>
                  <p className="mt-1 text-xs font-black uppercase tracking-[0.12em] text-emerald-700">
                    campos preenchidos
                  </p>
                </div>
                <div className="mt-4 space-y-3 text-sm font-medium text-slate-600">
                  <SummaryItem label="Fonte" value={status === "result" ? (processedMode === "image" ? "imagem enviada" : "descrição informada") : "aguardando entrada"} />
                  <SummaryItem label="Revisão" value="humana recomendada" />
                  <SummaryItem label="Publicação" value="nenhuma vaga será publicada automaticamente" />
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-black text-slate-900">O que significa cada status?</h3>
                <div className="mt-3 space-y-3 text-xs font-medium leading-relaxed text-slate-600">
                  <p>
                    <strong>Imagem processada / Descrição organizada:</strong> os dados foram lidos em modo demonstração.
                  </p>
                  <p>
                    <strong>Campos preenchidos:</strong> os campos foram preenchidos automaticamente no mock.
                  </p>
                  <p>
                    <strong>Revisão recomendada:</strong> revise antes de salvar ou publicar.
                  </p>
                </div>
              </div>

              <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-4 shadow-sm">
                <h3 className="text-sm font-black text-amber-900">Dica</h3>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-amber-800">
                  Revise especialmente salário, benefícios, requisitos obrigatórios e skills antes de salvar a vaga.
                </p>
              </div>
            </aside>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-600 shadow-sm transition hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" />
              Trocar imagem/descrição
            </button>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={handleEditFields}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-600 shadow-sm transition hover:bg-slate-50"
              >
                <Edit3 className="h-4 w-4" />
                Editar campos
              </button>
              <button
                type="button"
                onClick={handleApply}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#8a1c31] px-5 text-sm font-black text-white shadow-[0_14px_26px_-18px_rgba(86,17,31,0.9)] transition hover:bg-[#6f1727]"
              >
                <CheckCircle2 className="h-4 w-4" />
                Usar este preenchimento
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function ListSection({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <h4 className="text-sm font-black text-slate-900">{title}</h4>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-sm leading-snug text-slate-700">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#8a1c31]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="mt-1 text-xs font-black text-slate-700">{value}</p>
    </div>
  );
}
