import { Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { publicApplicationService } from "../services/publicApplicationService";
import { formatSalaryExpectationInput } from "../utils/salary";
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
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[hsl(var(--primary))]">Pretensão salarial e currículo</p>
        <h2 className="text-2xl font-semibold tracking-tight text-[hsl(var(--text))]">Informe sua faixa pretendida e envie o currículo</h2>
        <p className="text-sm text-[hsl(var(--text-muted))]">
          A pretensão salarial é obrigatória e será considerada em conjunto com o regime desejado.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-[1.2fr,0.8fr]">
        <div>
          <label htmlFor="candidate-salary-expectation" className="block text-sm font-medium text-gray-700">Pretensão salarial *</label>
          <input
            id="candidate-salary-expectation"
            type="text"
            value={form.salaryExpectation}
            onChange={(e) => onChange("salaryExpectation", formatSalaryExpectationInput(e.target.value))}
            placeholder="R$ 2.500,00"
            className={`mt-1 h-12 w-full rounded-2xl border px-4 py-2 ${
              errors.salaryExpectation ? "border-red-500" : "border-gray-300"
            } focus:outline-none focus:ring-2 focus:ring-blue-500`}
          />
          {errors.salaryExpectation ? (
            <p className="mt-1 text-sm text-red-600">{errors.salaryExpectation}</p>
          ) : (
            <p className="mt-1 text-xs text-gray-500">Informe um valor bruto mensal em BRL.</p>
          )}
        </div>

        <div>
          <span className="block text-sm font-medium text-gray-700">Regime desejado *</span>
          <div className="mt-2 flex flex-wrap gap-3">
            {(["CLT", "PJ", "Indiferente"] as const).map((regime) => (
              <label key={regime} htmlFor={`candidate-contract-${regime}`} className="flex items-center gap-2 rounded-full border border-slate-300 px-4 py-2">
                <input
                  id={`candidate-contract-${regime}`}
                  type="radio"
                  name="contract"
                  value={regime}
                  checked={form.desiredContractType === regime}
                  onChange={(e) => onChange("desiredContractType", e.target.value)}
                  className="h-4 w-4"
                />
                <span className="text-sm">{regime}</span>
              </label>
            ))}
          </div>
          {errors.desiredContractType && (
            <p className="mt-1 text-sm text-red-600">{errors.desiredContractType}</p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="candidate-job-id" className="block text-sm font-medium text-gray-700">Vaga desejada *</label>
        <p className="mb-2 text-xs text-gray-500">Escolha uma vaga publicada ou Banco de Talentos.</p>
        <select
          id="candidate-job-id"
          value={form.jobId || ""}
          onChange={(e) => onChange("jobId", e.target.value || null)}
          className={`h-12 w-full rounded-2xl border px-4 py-2 ${
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

      <div>
        <label htmlFor="candidate-resume-upload" className="block text-sm font-medium text-gray-700">Currículo em PDF *</label>

        <div className="mt-2">
          {!form.resumeFile ? (
            <label
              htmlFor="candidate-resume-upload"
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-gray-300 bg-gray-50 p-8 transition-colors hover:border-blue-400 hover:bg-blue-50"
            >
              <Upload className="h-8 w-8 text-gray-400" />
              <span className="text-sm font-medium text-gray-700">Clique para selecionar ou arraste um arquivo</span>
              <span className="text-xs text-gray-500">PDF, máximo 10 MB</span>
              <input
                id="candidate-resume-upload"
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          ) : (
            <div className="flex items-center justify-between rounded-2xl border border-green-300 bg-green-50 p-4">
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

      {!loadingJobs && jobs.length === 0 && (
        <div className="rounded-2xl bg-yellow-50 p-3 text-sm text-yellow-800">
          ⚠️ Nenhuma vaga publicada no momento. Sua candidatura será registrada no Banco de Talentos.
        </div>
      )}
    </div>
  );
}
