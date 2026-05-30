import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileText, Loader2, Upload, X } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { candidaturasService, type ImportCandidatesResult } from "../../../services/candidaturasService";
import { listJobs } from "../../../services/jobsService";
import type { Job } from "../../../types/domain";
import { toast } from "../../../shared/utils/toast";

type Tab = "manual" | "import";

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

// ── CSV preview helper ─────────────────────────────────────────────────────────

const KNOWN_COLS = ["nome", "email", "telefone", "vaga", "observacao"];

export type CsvPreview = {
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
  columnWarning: string | null;
};

function splitCSVLine(line: string): string[] {
  const values: string[] = [];
  let cur = "";
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === "," && !inQ) { values.push(cur.trim()); cur = ""; }
    else { cur += ch; }
  }
  values.push(cur.trim());
  return values;
}

function _readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve((e.target?.result as string) ?? "");
    reader.onerror = () => reject(new Error("Erro ao ler arquivo"));
    reader.readAsText(file, "utf-8");
  });
}

export async function parseCSVForPreview(file: File): Promise<CsvPreview> {
  try {
    const text = await _readFileText(file);
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length === 0) {
      return { headers: [], rows: [], totalRows: 0, columnWarning: "Arquivo vazio." };
    }

    const rawHeaders = splitCSVLine(lines[0]).map(h =>
      h.toLowerCase().replace(/^["']|["']$/g, "")
    );
    const hasNome = rawHeaders.includes("nome");
    const hasContact = rawHeaders.includes("email") || rawHeaders.includes("telefone");

    const columnWarning =
      !hasNome || !hasContact
        ? "Não encontramos as colunas obrigatórias nome e contato."
        : null;

    const dataLines = lines.slice(1);
    const totalRows = dataLines.length;
    const previewLines = dataLines.slice(0, 5);

    const rows = previewLines.map(line => {
      const vals = splitCSVLine(line);
      return Object.fromEntries(rawHeaders.map((h, i) => [h, vals[i] ?? ""]));
    });

    const headers = KNOWN_COLS.filter(c => rawHeaders.includes(c));

    return { headers, rows, totalRows, columnWarning };
  } catch {
    return { headers: [], rows: [], totalRows: 0, columnWarning: null };
  }
}

// ── Modal shell ────────────────────────────────────────────────────────────────

export function AddCandidateModal({ onClose, onSuccess }: Props) {
  const [tab, setTab] = useState<Tab>("manual");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      data-testid="add-candidate-modal"
    >
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0 bg-black/40 cursor-default"
        onClick={onClose}
      />
      <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-text">Adicionar candidatos</p>
            <p className="text-xs text-text-muted">Cadastre um candidato ou importe um CSV para conferência.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar modal"
            className="rounded-lg p-1 text-text-muted hover:bg-surface-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          <button
            type="button"
            onClick={() => setTab("manual")}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === "manual"
                ? "border-b-2 border-[hsl(var(--primary))] text-[hsl(var(--primary))]"
                : "text-text-muted hover:text-text"
            }`}
            data-testid="tab-manual"
          >
            Manual
          </button>
          <button
            type="button"
            onClick={() => setTab("import")}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === "import"
                ? "border-b-2 border-[hsl(var(--primary))] text-[hsl(var(--primary))]"
                : "text-text-muted hover:text-text"
            }`}
            data-testid="tab-import"
          >
            Importar planilha
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto">
          {tab === "manual" ? (
            <ManualTab onClose={onClose} onSuccess={onSuccess} />
          ) : (
            <ImportTab onClose={onClose} onSuccess={onSuccess} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Manual tab ─────────────────────────────────────────────────────────────────

function ManualTab({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [jobId, setJobId] = useState("");
  const [resumeSummary, setResumeSummary] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => { firstRef.current?.focus(); }, []);

  useEffect(() => {
    listJobs(1, 50, { statusFilter: "published" })
      .then((r) => setJobs(r.data))
      .catch(() => setJobs([]));
  }, []);

  function validate(): string | null {
    if (!fullName.trim()) return "Nome completo é obrigatório.";
    if (!email.trim() && !phone.trim()) return "Informe pelo menos e-mail ou telefone.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) { setValidationError(err); return; }
    setValidationError(null);
    setSaving(true);
    try {
      const result = await candidaturasService.createManual({
        full_name: fullName.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        job_id: jobId || undefined,
        resume_summary: resumeSummary.trim() || undefined,
      });
      if (result.duplicate_warning) {
        setDuplicateWarning(result.duplicate_warning);
      } else {
        toast.success("Candidato adicionado.");
        onSuccess();
        onClose();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar candidato.";
      setValidationError(msg);
    } finally {
      setSaving(false);
    }
  }

  if (duplicateWarning) {
    return (
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-start gap-3 rounded-xl bg-[hsl(var(--warning)/0.1)] border border-[hsl(var(--warning)/0.3)] px-4 py-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning mt-0.5" />
          <p className="text-sm text-warning">{duplicateWarning}</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Fechar
          </Button>
          <Button type="button" size="sm" onClick={() => { onSuccess(); onClose(); }}>
            Recarregar lista
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} noValidate>
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-text-muted" htmlFor="manual-name">
            Nome completo *
          </label>
          <input
            ref={firstRef}
            id="manual-name"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Ex: João da Silva"
            className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/30"
            data-testid="manual-name"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-muted" htmlFor="manual-email">
              E-mail
            </label>
            <input
              id="manual-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="joao@exemplo.com"
              className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/30"
              data-testid="manual-email"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-muted" htmlFor="manual-phone">
              Telefone
            </label>
            <input
              id="manual-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(11) 99999-0001"
              className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/30"
              data-testid="manual-phone"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-text-muted" htmlFor="manual-job">
            Vaga (opcional)
          </label>
          <select
            id="manual-job"
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/30"
            data-testid="manual-job"
          >
            <option value="">Sem vaga específica</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>{j.title}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-text-muted" htmlFor="manual-summary">
            Resumo do currículo ou observação (opcional)
          </label>
          <textarea
            id="manual-summary"
            value={resumeSummary}
            onChange={(e) => setResumeSummary(e.target.value)}
            rows={3}
            placeholder="Experiência relevante, observações do recrutador..."
            className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/30 resize-none"
            data-testid="manual-summary"
          />
        </div>

        {validationError && (
          <p role="alert" className="text-xs text-danger" data-testid="manual-error">
            {validationError}
          </p>
        )}
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-end">
        <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={saving} data-testid="manual-submit">
          {saving ? (
            <span className="flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Salvando...
            </span>
          ) : (
            "Salvar candidato"
          )}
        </Button>
      </div>
    </form>
  );
}

// ── Import tab ─────────────────────────────────────────────────────────────────

function ImportTab({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportCandidatesResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [csvPreview, setCsvPreview] = useState<CsvPreview | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listJobs(1, 50, { statusFilter: "published" })
      .then((r) => setJobs(r.data))
      .catch(() => setJobs([]));
  }, []);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setResult(null);
    setError(null);
    setCsvPreview(null);
    if (f) {
      const parsed = await parseCSVForPreview(f);
      setCsvPreview(parsed);
    }
  }

  function downloadTemplate() {
    const csv = candidaturasService.buildCSVTemplate();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo-candidaturas.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport() {
    if (!file) return;
    setError(null);
    setImporting(true);
    try {
      const res = await candidaturasService.importCSV(file, jobId || undefined);
      setResult(res);
      if (res.created > 0 || res.linked > 0) {
        onSuccess();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao importar.";
      setError(msg);
    } finally {
      setImporting(false);
    }
  }

  function handleImportAnother() {
    setFile(null);
    setResult(null);
    setError(null);
    setCsvPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  // ── Result view ──────────────────────────────────────────────────────────────

  if (result) {
    const validCount = result.created + result.linked;
    const hasNoValidCandidates = validCount === 0;

    return (
      <div className="flex flex-col gap-4 p-5" data-testid="import-result">
        {/* Header */}
        <div className="flex items-center gap-2">
          {hasNoValidCandidates ? (
            <AlertTriangle className="h-4 w-4 text-warning shrink-0" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-success shrink-0" aria-hidden="true" />
          )}
          <div>
            <p className="text-sm font-semibold text-text">Importação concluída</p>
            {hasNoValidCandidates && (
              <p className="text-xs text-text-muted" data-testid="import-no-valid-candidates">
                Nenhum candidato válido foi criado ou vinculado. Revise duplicados e erros antes de tentar novamente.
              </p>
            )}
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="import-result-stats">
          <div className="flex flex-col items-center rounded-xl bg-surface-muted px-2 py-2.5 text-center">
            <span className="text-base font-bold tabular-nums text-success">{result.created}</span>
            <p data-testid="stat-criados" className="text-[11px] text-text-muted">
              {result.created} criado{result.created !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex flex-col items-center rounded-xl bg-surface-muted px-2 py-2.5 text-center">
            <span className="text-base font-bold tabular-nums text-[hsl(var(--primary))]">{result.linked}</span>
            <p data-testid="stat-vinculados" className="text-[11px] text-text-muted">
              {result.linked} vinculado{result.linked !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex flex-col items-center rounded-xl bg-surface-muted px-2 py-2.5 text-center">
            <span className="text-base font-bold tabular-nums text-warning">{result.duplicates}</span>
            <p data-testid="stat-duplicados" className="text-[11px] text-text-muted">
              {result.duplicates} duplicado{result.duplicates !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex flex-col items-center rounded-xl bg-surface-muted px-2 py-2.5 text-center">
            <span className="text-base font-bold tabular-nums text-danger">{result.errors.length}</span>
            <p data-testid="stat-erros" className="text-[11px] text-text-muted">
              {result.errors.length} erro{result.errors.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* Duplicate warning */}
        {result.duplicates > 0 && (
          <div
            className="flex items-start gap-2 rounded-lg border border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning)/0.08)] px-3 py-2.5"
            data-testid="duplicate-warning"
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning mt-0.5" aria-hidden="true" />
            <p className="text-xs text-warning">Candidatos duplicados não foram recriados.</p>
          </div>
        )}

        {/* Error list */}
        {result.errors.length > 0 && (
          <div className="rounded-xl border border-[hsl(var(--danger)/0.3)] bg-[hsl(var(--danger)/0.05)] px-4 py-3">
            <p className="mb-2 text-xs font-semibold text-danger">
              {result.errors.length} erro{result.errors.length !== 1 ? "s" : ""}
            </p>
            <ul className="max-h-32 space-y-1 overflow-y-auto" data-testid="import-errors">
              {result.errors.map((e, i) => (
                <li key={i} className="text-xs text-danger">
                  Linha {e.row} — {e.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleImportAnother}
            data-testid="import-another-btn"
          >
            Importar outro arquivo
          </Button>
          <Button type="button" size="sm" onClick={onClose} data-testid="import-close-btn">
            Fechar
          </Button>
        </div>
      </div>
    );
  }

  // ── Upload form ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4 p-5">
      {/* Orientation block */}
      <div className="rounded-xl border border-border bg-surface-muted px-4 py-3 space-y-2">
        <p className="text-xs font-medium text-text">
          Use uma planilha com as colunas:{" "}
          <span className="font-mono text-[hsl(var(--primary))]">
            nome, email, telefone, vaga, observacao
          </span>
        </p>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
          Exemplo de linha
        </p>
        <div className="flex flex-wrap items-center gap-1 text-[11px]" data-testid="csv-example">
          {["Ana Souza", "ana@email.com", "(62) 99999-0000", "Operador de Caixa", "Disponível para escala"].map(
            (v, i, arr) => (
              <span key={i} className="flex items-center gap-1">
                <span className="rounded bg-surface px-1.5 py-0.5 font-medium text-text">{v}</span>
                {i < arr.length - 1 && <span className="text-text-muted">|</span>}
              </span>
            )
          )}
        </div>
      </div>

      {/* Download template */}
      <button
        type="button"
        onClick={downloadTemplate}
        className="flex w-fit items-center gap-1.5 text-xs text-[hsl(var(--primary))] hover:underline"
        data-testid="download-template"
      >
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        Baixar modelo CSV
      </button>

      {/* Job selector */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-text-muted" htmlFor="import-job">
          Vaga padrão (opcional)
        </label>
        <select
          id="import-job"
          value={jobId}
          onChange={(e) => setJobId(e.target.value)}
          className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/30"
          data-testid="import-job"
        >
          <option value="">Sem vaga</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>{j.title}</option>
          ))}
        </select>
      </div>

      {/* File drop zone */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-text-muted">Arquivo CSV *</label>
        <div
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-surface-muted px-4 py-6 transition-colors hover:border-[hsl(var(--primary))]/50"
          onClick={() => fileRef.current?.click()}
          role="button"
          tabIndex={0}
          aria-label="Selecionar arquivo CSV"
          onKeyDown={(e) => { if (e.key === "Enter") fileRef.current?.click(); }}
          data-testid="file-drop-zone"
        >
          {file ? (
            <>
              <FileText className="h-5 w-5 text-[hsl(var(--primary))]" aria-hidden="true" />
              <p className="text-sm font-medium text-text">{file.name}</p>
              <p className="text-xs text-text-muted">Clique para trocar o arquivo</p>
            </>
          ) : (
            <>
              <Upload className="h-5 w-5 text-text-muted" aria-hidden="true" />
              <p className="text-sm text-text-muted">Clique para selecionar arquivo .csv</p>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => { void handleFileChange(e); }}
            data-testid="import-file-input"
          />
        </div>
      </div>

      {/* Column warning */}
      {csvPreview?.columnWarning && (
        <div
          className="flex items-start gap-2 rounded-lg border border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning)/0.08)] px-3 py-2.5"
          data-testid="column-warning"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning mt-0.5" aria-hidden="true" />
          <p className="text-xs text-warning">{csvPreview.columnWarning}</p>
        </div>
      )}

      {/* Preview table */}
      {csvPreview && !csvPreview.columnWarning && csvPreview.rows.length > 0 && (
        <div data-testid="csv-preview">
          <p className="mb-1.5 text-xs font-medium text-text-muted">
            Prévia —{" "}
            <span data-testid="csv-row-count">
              {csvPreview.totalRows} linha{csvPreview.totalRows !== 1 ? "s" : ""} detectada{csvPreview.totalRows !== 1 ? "s" : ""}
            </span>
          </p>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-surface-muted">
                  {csvPreview.headers.map((h) => (
                    <th key={h} className="px-2 py-1.5 text-left font-semibold capitalize text-text-muted">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {csvPreview.rows.map((row, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    {csvPreview.headers.map((h) => (
                      <td key={h} className="max-w-[110px] truncate px-2 py-1.5 text-text">
                        {row[h] || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {csvPreview.totalRows > 5 && (
            <p className="mt-1 text-[11px] text-text-muted">
              Mostrando 5 de {csvPreview.totalRows} linhas.
            </p>
          )}
        </div>
      )}

      {/* No data warning */}
      {csvPreview && !csvPreview.columnWarning && csvPreview.rows.length === 0 && (
        <p className="text-xs text-text-muted" data-testid="no-data-warning">
          Arquivo sem linhas de dados.
        </p>
      )}

      {error && (
        <p role="alert" className="text-xs text-danger" data-testid="import-error">
          {error}
        </p>
      )}

      {/* Actions */}
      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-end">
        <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={importing}>
          Cancelar
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!file || importing}
          onClick={() => void handleImport()}
          data-testid="import-submit"
        >
          {importing ? (
            <span className="flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Importando...
            </span>
          ) : (
            "Confirmar importação"
          )}
        </Button>
      </div>
    </div>
  );
}
