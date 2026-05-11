import { useRef, useState } from "react";
import type { DragEvent } from "react";
import {
  AlertCircle,
  ArrowRight,
  Clock3,
  FileText,
  FileUp,
  Loader2,
  RotateCcw,
  UserCheck,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { PageHeader } from "../components/common/PageHeader";
import { LinkCandidateJobModal } from "../features/candidates/components/LinkCandidateJobModal";
import { formatContextError } from "../services/errorMessages";
import { resumeService } from "../services/resumeService";
import { useExtractionPolling } from "../shared/hooks/useExtractionPolling";
import {
  type ExtractionStatus,
  getExtractionStatusLabel,
} from "../shared/utils/extractionStatus";

type ImportItem = {
  id: string;
  resumeId?: string;
  candidateId?: string;
  candidateName: string;
  fileName: string;
  extractionStatus: ExtractionStatus;
  errorMessage?: string;
};

type LinkTarget = {
  candidateId: string;
  candidateName: string;
};

function getStatusAccent(status: ExtractionStatus): string {
  if (status === "completed") return "border-emerald-100 bg-emerald-50/50 dark:border-emerald-900/20";
  if (status === "failed") return "border-rose-100 bg-rose-50/50 dark:border-rose-900/20";
  return "border-amber-100 bg-amber-50/50 dark:border-amber-900/20";
}

function getStatusBadge(status: ExtractionStatus): string {
  if (status === "completed") return "bg-emerald-500 text-white";
  if (status === "failed") return "bg-rose-500 text-white";
  return "bg-amber-500 text-white";
}

function getStatusIcon(status: ExtractionStatus) {
  if (status === "completed") return <UserCheck className="h-4 w-4" />;
  if (status === "failed") return <X className="h-4 w-4" />;
  return <Clock3 className="h-4 w-4" />;
}

export function ImportPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [items, setItems] = useState<ImportItem[]>([]);
  const [linkTarget, setLinkTarget] = useState<LinkTarget | null>(null);

  const pendingResumeIds = items
    .filter(
      (item) =>
        (item.extractionStatus === "pending" || item.extractionStatus === "processing") &&
        typeof item.resumeId === "string",
    )
    .map((item) => item.resumeId!);

  useExtractionPolling({
    items: pendingResumeIds,
    enabled: pendingResumeIds.length > 0,
    intervalMs: 2500,
    onItemUpdate: (resumeId, status) => {
      setItems((current) =>
        current.map((item) =>
          item.resumeId === resumeId
            ? {
                ...item,
                extractionStatus: status.extraction_status,
                errorMessage:
                  status.extraction_status === "failed"
                    ? status.extraction_error || getExtractionStatusLabel("failed")
                    : undefined,
              }
            : item,
        ),
      );
    },
  });

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setUploading(true);

    const uploadedItems = await Promise.all(
      Array.from(files).map(async (file, index): Promise<ImportItem> => {
        const baseId = `${file.name}-${Date.now()}-${index}`;

        if (file.type !== "application/pdf") {
          return {
            id: baseId,
            fileName: file.name,
            candidateName: "N/A",
            extractionStatus: "failed",
            errorMessage: "Apenas arquivos PDF são permitidos.",
          };
        }

        try {
          const init = await resumeService.initiateUpload();
          const uploaded = await resumeService.uploadPdf(init.resume_id, file);

          return {
            id: uploaded.resume_id,
            resumeId: uploaded.resume_id,
            candidateId: uploaded.candidate_id,
            candidateName: uploaded.candidate_full_name,
            fileName: file.name,
            extractionStatus:
              uploaded.extraction_status === "completed" ||
              uploaded.extraction_status === "failed" ||
              uploaded.extraction_status === "processing"
                ? uploaded.extraction_status
                : "pending",
          };
        } catch (error) {
          return {
            id: baseId,
            fileName: file.name,
            candidateName: "Erro na importação",
            extractionStatus: "failed",
            errorMessage: formatContextError(error, "Falha ao processar arquivo."),
          };
        }
      }),
    );

    setItems((current) => [...uploadedItems, ...current]);
    setUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const onDragOver = (event: DragEvent) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => setIsDragging(false);

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    void handleFiles(event.dataTransfer.files);
  };

  return (
    <div className="space-y-8 px-6 py-6 pb-12">
      <PageHeader
        title="Importar Candidatos"
        subtitle="Carregue currículos em PDF para criar novos perfis automaticamente."
      />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(420px,620px)]">
        <div className="space-y-6">
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`relative flex min-h-[300px] flex-col items-center justify-center rounded-[32px] border-2 border-dashed transition-all ${
              isDragging
                ? "border-[hsl(var(--primary))] bg-[hsl(var(--accent-soft))] scale-[0.99]"
                : "border-[hsl(var(--border-strong))]/30 bg-[hsl(var(--surface))]"
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={(event) => void handleFiles(event.target.files)}
              className="absolute inset-0 cursor-pointer opacity-0"
              multiple
              accept=".pdf"
              disabled={uploading}
            />
            <div className="flex flex-col items-center text-center">
              <div
                className={`mb-4 rounded-3xl p-5 ${
                  isDragging
                    ? "bg-[hsl(var(--primary))]/20 text-[hsl(var(--primary))]"
                    : "bg-[hsl(var(--surface-muted))] text-[hsl(var(--text-muted))]"
                }`}
              >
                {uploading ? (
                  <Loader2 className="h-10 w-10 animate-spin" />
                ) : (
                  <FileUp className="h-10 w-10" />
                )}
              </div>
              <h3 className="text-xl font-bold text-[hsl(var(--text))]">
                {uploading ? "Enviando arquivos..." : "Arraste seus PDFs aqui"}
              </h3>
              <p className="mt-2 max-w-xs text-sm text-[hsl(var(--text-muted))]">
                Ou clique para selecionar vários arquivos do seu computador.
              </p>
              <div className="mt-6 flex gap-3">
                <span className="rounded-full bg-[hsl(var(--surface-muted))] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--text-muted))]">
                  PDF Apenas
                </span>
                <span className="rounded-full bg-[hsl(var(--surface-muted))] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--text-muted))]">
                  Importação em lote
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-blue-200 bg-blue-50 p-6 text-blue-900 dark:border-blue-900/30 dark:bg-blue-900/10 dark:text-blue-200">
            <div className="flex gap-4">
              <AlertCircle className="h-6 w-6 shrink-0" />
              <div>
                <h4 className="font-bold">Regras de Importação</h4>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm opacity-90">
                  <li>A importação cria o cadastro do candidato e anexa o currículo.</li>
                  <li className="font-semibold text-blue-700 dark:text-blue-300">
                    Não cria pipeline automaticamente: o candidato ficará em "Aguardando Vaga".
                  </li>
                  <li>Não cria score nem análise IA de vaga durante a importação.</li>
                  <li>Vincular a uma vaga é uma ação manual, disponível após extração concluída.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="ui-card flex min-h-[420px] flex-col rounded-[32px] p-6">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold">Lote Atual</h3>
              <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">
                Cada arquivo mantém seu próprio status de extração.
              </p>
            </div>
            {items.length > 0 ? (
              <button
                onClick={() => setItems([])}
                className="text-xs font-semibold text-[hsl(var(--text-muted))] hover:text-[hsl(var(--text))]"
              >
                Limpar
              </button>
            ) : null}
          </div>

          {items.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center py-12 text-center opacity-40">
              <FileText className="mb-3 h-12 w-12" />
              <p className="text-sm">Nenhum arquivo processado nesta sessão.</p>
            </div>
          ) : (
            <div className="flex-1 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
                      Arquivo
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
                      Candidato
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
                      Status da extração
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
                      Ação
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[hsl(var(--border))] bg-[hsl(var(--surface))]">
                  {items.map((item) => {
                    const canViewCandidate = Boolean(item.candidateId);
                    const canLinkToJob =
                      item.extractionStatus === "completed" && Boolean(item.candidateId);

                    return (
                      <tr key={item.id} className={getStatusAccent(item.extractionStatus)}>
                        <td className="px-4 py-4 align-top">
                          <p className="font-semibold text-[hsl(var(--text))]">{item.fileName}</p>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <p className="font-medium text-[hsl(var(--text))]">{item.candidateName}</p>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="flex items-start gap-3">
                            <span
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${getStatusBadge(item.extractionStatus)}`}
                            >
                              {getStatusIcon(item.extractionStatus)}
                            </span>
                            <div className="min-w-0">
                              <p className="font-medium text-[hsl(var(--text))]">
                                {getExtractionStatusLabel(item.extractionStatus)}
                              </p>
                              {item.errorMessage ? (
                                <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">
                                  {item.errorMessage}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="flex flex-wrap gap-2">
                            {canViewCandidate ? (
                              <button
                                type="button"
                                onClick={() => navigate(`/candidatos?candidateId=${item.candidateId}`)}
                                className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-xs font-medium text-[hsl(var(--text))] transition hover:bg-[hsl(var(--surface-muted))]"
                              >
                                Ver candidato
                                <ArrowRight className="h-3.5 w-3.5" />
                              </button>
                            ) : null}

                            {canLinkToJob ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setLinkTarget({
                                    candidateId: item.candidateId!,
                                    candidateName: item.candidateName,
                                  })
                                }
                                className="rounded-lg bg-[hsl(var(--primary))] px-3 py-2 text-xs font-medium text-white transition hover:bg-[hsl(var(--primary))]/90"
                              >
                                Adicionar a uma vaga
                              </button>
                            ) : null}

                            {item.extractionStatus === "failed" ? (
                              <button
                                type="button"
                                disabled
                                title="Reprocessamento indisponível até a API expor um endpoint dedicado."
                                className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-xs font-medium text-[hsl(var(--text-muted))] opacity-60"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                Reprocessar extração
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <LinkCandidateJobModal
        isOpen={linkTarget !== null}
        candidateId={linkTarget?.candidateId ?? null}
        candidateName={linkTarget?.candidateName ?? null}
        onClose={() => setLinkTarget(null)}
      />
    </div>
  );
}
