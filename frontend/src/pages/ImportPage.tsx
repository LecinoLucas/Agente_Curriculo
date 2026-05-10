import { useEffect, useRef, useState } from "react";
import { 
  FileUp, 
  AlertCircle, 
  Loader2, 
  ArrowRight,
  X,
  FileText,
  UserCheck,
  Clock3,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { PageHeader } from "../components/common/PageHeader";
import { resumeService } from "../services/resumeService";
import { formatContextError } from "../services/errorMessages";

interface ImportResult {
  resumeId?: string;
  fileName: string;
  candidateName: string;
  status: "pending" | "success" | "error";
  message?: string;
}

export function ImportPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<ImportResult[]>([]);

  useEffect(() => {
    const pendingItems = results.filter(
      (result) => result.status === "pending" && typeof result.resumeId === "string",
    );

    if (pendingItems.length === 0) {
      return;
    }

    const timerId = window.setTimeout(() => {
      void Promise.all(
        pendingItems.map(async (result) => {
          try {
            const status = await resumeService.getExtractionStatus(result.resumeId!);

            if (status.extraction_status === "completed") {
              setResults((current) =>
                current.map((item) =>
                  item.resumeId === result.resumeId
                    ? {
                        ...item,
                        status: "success",
                        message: "Extração concluída.",
                      }
                    : item,
                ),
              );
              return;
            }

            if (status.extraction_status === "failed") {
              setResults((current) =>
                current.map((item) =>
                  item.resumeId === result.resumeId
                    ? {
                        ...item,
                        status: "error",
                        message: status.extraction_error || "Falha ao extrair o currículo.",
                      }
                    : item,
                ),
              );
            }
          } catch {
            // Mantém estado pendente para próxima tentativa automática.
          }
        }),
      );
    }, 2500);

    return () => window.clearTimeout(timerId);
  }, [results]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    const newResults: ImportResult[] = [];

    for (const file of Array.from(files)) {
      if (file.type !== "application/pdf") {
        newResults.push({
          fileName: file.name,
          candidateName: "N/A",
          status: "error",
          message: "Apenas arquivos PDF são permitidos.",
        });
        continue;
      }

      try {
        // 1. Iniciar o objeto resume (cria o candidato se necessário no backend)
        const init = await resumeService.initiateUpload();
        // 2. Fazer o upload do arquivo
        const res = await resumeService.uploadPdf(init.resume_id, file);
        
        newResults.push({
          resumeId: res.resume_id,
          fileName: file.name,
          candidateName: res.candidate_full_name,
          status: "pending",
          message: "Currículo enviado, extração em andamento.",
        });
      } catch (err) {
        newResults.push({
          fileName: file.name,
          candidateName: "Erro na importação",
          status: "error",
          message: formatContextError(err, "Falha ao processar arquivo."),
        });
      }
    }

    setResults(prev => [...newResults, ...prev]);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => setIsDragging(false);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="space-y-8 px-6 py-6 pb-12">
      <PageHeader 
        title="Importar Candidatos" 
        subtitle="Carregue currículos em PDF para criar novos perfis automaticamente."
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          {/* Dropzone */}
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
              onChange={(e) => handleFiles(e.target.files)}
              className="absolute inset-0 cursor-pointer opacity-0"
              multiple
              accept=".pdf"
              disabled={uploading}
            />
            <div className="flex flex-col items-center text-center">
              <div className={`mb-4 rounded-3xl p-5 ${isDragging ? "bg-[hsl(var(--primary))]/20 text-[hsl(var(--primary))]" : "bg-[hsl(var(--surface-muted))] text-[hsl(var(--text-muted))]"}`}>
                {uploading ? (
                  <Loader2 className="h-10 w-10 animate-spin" />
                ) : (
                  <FileUp className="h-10 w-10" />
                )}
              </div>
              <h3 className="text-xl font-bold text-[hsl(var(--text))]">
                {uploading ? "Processando arquivos..." : "Arraste seus PDFs aqui"}
              </h3>
              <p className="mt-2 max-w-xs text-sm text-[hsl(var(--text-muted))]">
                Ou clique para selecionar arquivos do seu computador.
              </p>
              <div className="mt-6 flex gap-3">
                <span className="rounded-full bg-[hsl(var(--surface-muted))] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--text-muted))]">
                  PDF Apenas
                </span>
                <span className="rounded-full bg-[hsl(var(--surface-muted))] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--text-muted))]">
                  Múltiplos arquivos
                </span>
              </div>
            </div>
          </div>

          {/* Important Note */}
          <div className="rounded-3xl border border-blue-200 bg-blue-50 p-6 text-blue-900 dark:border-blue-900/30 dark:bg-blue-900/10 dark:text-blue-200">
            <div className="flex gap-4">
              <AlertCircle className="h-6 w-6 shrink-0" />
              <div>
                <h4 className="font-bold">Regras de Importação</h4>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm opacity-90">
                  <li>A importação cria o cadastro do candidato e anexa o currículo.</li>
                  <li className="font-semibold text-blue-700 dark:text-blue-300">Não cria pipeline automaticamente: o candidato ficará em "Aguardando Vaga".</li>
                  <li>A análise por IA será iniciada apenas quando o candidato for vinculado a uma vaga ativa.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Results Sidebar */}
        <div className="ui-card flex flex-col rounded-[32px] p-6">
          <div className="mb-6 flex items-center justify-between">
            <h3 className="text-lg font-bold">Resultados Recentes</h3>
            {results.length > 0 && (
              <button 
                onClick={() => setResults([])}
                className="text-xs font-semibold text-[hsl(var(--text-muted))] hover:text-[hsl(var(--text))]"
              >
                Limpar
              </button>
            )}
          </div>
          
          <div className="flex-1 space-y-3 overflow-y-auto pr-1">
            {results.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center py-12 text-center opacity-40">
                <FileText className="mb-3 h-12 w-12" />
                <p className="text-sm">Nenhum arquivo processado nesta sessão.</p>
              </div>
            ) : (
              results.map((result, idx) => (
                <div 
                  key={idx}
                  className={`flex items-center gap-3 rounded-2xl border p-3 ${
                    result.status === "success"
                      ? "border-emerald-100 bg-emerald-50/50 dark:border-emerald-900/20"
                      : result.status === "pending"
                        ? "border-amber-100 bg-amber-50/50 dark:border-amber-900/20"
                        : "border-rose-100 bg-rose-50/50 dark:border-rose-900/20"
                  }`}
                >
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    result.status === "success"
                      ? "bg-emerald-500 text-white"
                      : result.status === "pending"
                        ? "bg-amber-500 text-white"
                        : "bg-rose-500 text-white"
                  }`}>
                    {result.status === "success" ? (
                      <UserCheck className="h-4 w-4" />
                    ) : result.status === "pending" ? (
                      <Clock3 className="h-4 w-4" />
                    ) : (
                      <X className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-[hsl(var(--text))]">{result.fileName}</p>
                    <p className="truncate text-[10px] text-[hsl(var(--text-muted))]">
                      {result.status === "error"
                        ? result.message
                        : `${result.candidateName} • ${result.message ?? ""}`}
                    </p>
                  </div>
                  {result.status !== "error" && (
                    <button 
                      onClick={() => navigate("/candidatos")}
                      className="rounded-lg p-1.5 hover:bg-black/5"
                    >
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
