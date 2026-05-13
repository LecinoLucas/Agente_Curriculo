import { Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { publicApplicationService } from "../services/publicApplicationService";
import type { FormData, ApplicationErrors, Job } from "../types";

interface Props {
  form: FormData;
  errors: ApplicationErrors;
  onChange: (field: keyof FormData, value: unknown) => void;
}

export function JobResumeStep({ form, errors, onChange }: Props) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);

  useEffect(() => {
    publicApplicationService
      .listPublishedJobs()
      .then(setJobs)
      .catch((err) => {
        console.error("Erro ao carregar vagas:", err);
        setJobs([]);
      })
      .finally(() => setLoadingJobs(false));
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onChange("resumeFile", file);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900">Vaga e currículo</h2>

      {/* Seleção de Vaga */}
      <div>
        <label className="block text-sm font-medium text-gray-700">Vaga desejada *</label>
        <p className="mb-2 text-xs text-gray-500">Escolha uma vaga publicada ou Banco de Talentos.</p>
        <select
          value={form.jobId || ""}
          onChange={(e) => onChange("jobId", e.target.value || null)}
          className={`w-full rounded border px-3 py-2 ${
            errors.jobId ? "border-red-500" : "border-gray-300"
          } focus:outline-none focus:ring-2 focus:ring-blue-500`}
        >
          <option value="">Banco de Talentos</option>
          {loadingJobs ? (
            <option disabled>Carregando vagas...</option>
          ) : (
            jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title}
                {job.location ? ` - ${job.location}` : ""}
              </option>
            ))
          )}
        </select>
        {errors.jobId && <p className="mt-1 text-sm text-red-600">{errors.jobId}</p>}
      </div>

      {/* Upload de Currículo */}
      <div>
        <label className="block text-sm font-medium text-gray-700">Currículo em PDF *</label>

        <div className="mt-2">
          {!form.resumeFile ? (
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-8 transition-colors hover:border-blue-400 hover:bg-blue-50">
              <Upload className="h-8 w-8 text-gray-400" />
              <span className="text-sm font-medium text-gray-700">Clique para selecionar ou arraste um arquivo</span>
              <span className="text-xs text-gray-500">PDF, máximo 10 MB</span>
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          ) : (
            <div className="flex items-center justify-between rounded-lg border border-green-300 bg-green-50 p-4">
              <span className="text-sm font-medium text-green-800">
                ✓ {form.resumeFile.name}
                <span className="ml-2 text-xs">({(form.resumeFile.size / 1024).toFixed(0)} KB)</span>
              </span>
              <button
                type="button"
                onClick={() => onChange("resumeFile", null)}
                className="text-sm text-green-700 underline hover:text-green-900"
              >
                Mudar
              </button>
            </div>
          )}
        </div>

        {errors.resumeFile && <p className="mt-2 text-sm text-red-600">{errors.resumeFile}</p>}

        <div className="mt-3 text-xs text-gray-600">
          <p className="font-medium">Formatos aceitos:</p>
          <p>• PDF (recomendado)</p>
        </div>
      </div>

      {/* Info sobre vagas */}
      {!loadingJobs && jobs.length === 0 && (
        <div className="rounded-lg bg-yellow-50 p-3 text-sm text-yellow-800">
          ⚠️ Nenhuma vaga publicada no momento. Sua candidatura será registrada no Banco de Talentos.
        </div>
      )}
    </div>
  );
}
