import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ChevronRight, Upload, CheckCircle2, AlertCircle } from 'lucide-react';
import { CandidatePortalLayout } from '../components/layout/CandidatePortalLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { LoadingState } from '../components/shared/LoadingState';
import { publicJobsService } from '../services/publicJobsService';
import { publicApplicationService } from '../services/publicApplicationService';
import type { PublicJob } from '../types/candidatePortal';
import { JOB_AREA_LABELS, WORK_MODEL_LABELS } from '../types/candidatePortal';

// All 27 Brazilian federation units
const UF_LIST = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA',
  'MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN',
  'RS','RO','RR','SC','SP','SE','TO',
];

type FormStep = 1 | 2 | 3;

const STEPS = [
  { id: 1, label: 'Dados pessoais' },
  { id: 2, label: 'Currículo' },
  { id: 3, label: 'Revisão' },
];

interface FormState {
  full_name: string;
  cpf: string;
  email: string;
  phone: string;
  address_city: string;
  address_state: string;
  salary_expectation: string;
  desired_contract_type: 'CLT' | 'PJ' | 'Indiferente' | '';
  works_at_marajo_group: boolean;
  resume_file: File | null;
  lgpd_consent: boolean;
  password?: string;
  confirm_password?: string;
}

const INITIAL_FORM: FormState = {
  full_name: '',
  cpf: '',
  email: '',
  phone: '',
  address_city: '',
  address_state: '',
  salary_expectation: '',
  desired_contract_type: '',
  works_at_marajo_group: false,
  resume_file: null,
  lgpd_consent: false,
  password: '',
  confirm_password: '',
};

function validateStep1(f: FormState): string | null {
  if (!f.full_name.trim()) return 'Nome completo é obrigatório.';
  if (!f.cpf.replace(/\D/g, '')) return 'CPF é obrigatório.';
  if (!f.email.trim()) return 'E-mail é obrigatório.';
  if (!f.phone.trim()) return 'Telefone é obrigatório.';
  if (!f.address_city.trim()) return 'Cidade é obrigatória.';
  if (!f.address_state) return 'Estado é obrigatório.';
  if (!f.desired_contract_type) return 'Regime de contratação é obrigatório.';
  if (!f.password) return 'Senha é obrigatória para concluir o cadastro.';
  if (f.password.length < 8) return 'A senha deve ter no mínimo 8 caracteres.';
  if (f.password !== f.confirm_password) return 'A confirmação de senha não confere.';
  return null;
}

function validateStep2(f: FormState): string | null {
  if (!f.resume_file) return 'Selecione um arquivo de currículo.';
  return null;
}

function validateStep3(f: FormState): string | null {
  if (!f.lgpd_consent) return 'Você precisa aceitar a Política de Privacidade para enviar.';
  return null;
}

export function ApplicationFormPage() {
  // Route param carries the job UUID (the API uses IDs, not slugs)
  const { identifier } = useParams<{ identifier: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<PublicJob | null>(null);
  const [loadingJob, setLoadingJob] = useState(true);
  const [step, setStep] = useState<FormStep>(1);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [stepError, setStepError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    if (!identifier) { setLoadingJob(false); return; }
    publicJobsService
      .getJobById(identifier)
      .then(setJob)
      .catch(() => { /* sidebar stays empty — form still usable */ })
      .finally(() => setLoadingJob(false));
  }, [identifier]);

  function update(updates: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...updates }));
    setStepError(null);
  }

  function advance(nextStep: FormStep, validate: (f: FormState) => string | null) {
    const err = validate(form);
    if (err) { setStepError(err); return; }
    setStepError(null);
    setStep(nextStep);
  }

  async function handleSubmit() {
    const err = validateStep3(form);
    if (err) { setStepError(err); return; }
    if (!form.resume_file) return;

    setSubmitting(true);
    setApiError(null);
    try {
      await publicApplicationService.apply({
        full_name: form.full_name,
        cpf: form.cpf,
        email: form.email,
        phone: form.phone,
        city: form.address_city,
        state: form.address_state,
        salary_expectation: form.salary_expectation,
        desired_contract_type: form.desired_contract_type as 'CLT' | 'PJ' | 'Indiferente',
        works_at_marajo_group: form.works_at_marajo_group,
        job_id: identifier ?? null,
        lgpd_consent: form.lgpd_consent,
        resume_file: form.resume_file,
        password: form.password,
        confirm_password: form.confirm_password,
      });
      navigate('/sucesso');
    } catch (err) {
      setApiError(
        err instanceof Error
          ? err.message
          : 'Erro ao enviar candidatura. Tente novamente.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingJob) {
    return (
      <CandidatePortalLayout>
        <LoadingState variant="spinner" />
      </CandidatePortalLayout>
    );
  }

  return (
    <CandidatePortalLayout maxWidth="page">
      {/* Breadcrumb */}
      <nav className="mb-5 flex items-center gap-1.5 text-sm text-gray-500">
        <Link to="/vagas" className="hover:text-primary-700 transition-colors">Vagas</Link>
        <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
        <Link to={`/vagas/${identifier}`} className="hover:text-primary-700 transition-colors">
          {job?.title ?? 'Vaga'}
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
        <span className="text-gray-900 font-medium">Candidatura</span>
      </nav>

      {/* Step indicator */}
      <div className="mb-6 flex items-center gap-0">
        {STEPS.map((s, index) => {
          const isCompleted = step > s.id;
          const isCurrent = step === s.id;
          return (
            <div key={s.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center gap-1 flex-1">
                <div
                  className={[
                    'flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold transition-colors',
                    isCompleted
                      ? 'bg-primary-700 text-white'
                      : isCurrent
                        ? 'border-2 border-primary-700 text-primary-700 bg-white'
                        : 'border-2 border-gray-200 text-gray-400 bg-white',
                  ].join(' ')}
                >
                  {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : s.id}
                </div>
                <span
                  className={[
                    'text-xs text-center',
                    isCurrent ? 'font-semibold text-primary-700' : 'text-gray-400',
                  ].join(' ')}
                >
                  {s.label}
                </span>
              </div>
              {index < STEPS.length - 1 && (
                <div
                  className={['flex-1 h-0.5 mb-5', step > s.id ? 'bg-primary-700' : 'bg-gray-200'].join(' ')}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Form card */}
        <Card padding="lg">

          {/* ── Step 1: dados pessoais ─────────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  Candidatar-se{job ? ` para ${job.title}` : ''}
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Preencha seus dados pessoais para iniciar a candidatura.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Input
                    label="Nome completo"
                    value={form.full_name}
                    onChange={(e) => update({ full_name: e.target.value })}
                    placeholder="Seu nome completo"
                    required
                  />
                </div>
                <Input
                  label="CPF"
                  value={form.cpf}
                  onChange={(e) => update({ cpf: e.target.value })}
                  placeholder="000.000.000-00"
                  required
                />
                <Input
                  label="E-mail"
                  type="email"
                  value={form.email}
                  onChange={(e) => update({ email: e.target.value })}
                  placeholder="seu@email.com"
                  required
                />
                <Input
                  label="Telefone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => update({ phone: e.target.value })}
                  placeholder="(62) 9 0000-0000"
                  required
                />
                <Input
                  label="Cidade"
                  value={form.address_city}
                  onChange={(e) => update({ address_city: e.target.value })}
                  placeholder="Goiânia"
                  required
                />
                <div>
                  <label htmlFor="address_state" className="block text-sm font-medium text-gray-700 mb-1.5">
                    Estado <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="address_state"
                    value={form.address_state}
                    onChange={(e) => update({ address_state: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 focus:border-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-700/20"
                  >
                    <option value="">Selecione</option>
                    {UF_LIST.map((uf) => (
                      <option key={uf} value={uf}>{uf}</option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <Input
                    label="Pretensão salarial"
                    value={form.salary_expectation}
                    onChange={(e) => update({ salary_expectation: e.target.value })}
                    placeholder="Ex: R$ 2.500,00"
                  />
                </div>
                <Input
                  label="Senha para o Portal"
                  type="password"
                  value={form.password || ''}
                  onChange={(e) => update({ password: e.target.value })}
                  placeholder="Mínimo 8 caracteres"
                  required
                />
                <Input
                  label="Confirme a senha"
                  type="password"
                  value={form.confirm_password || ''}
                  onChange={(e) => update({ confirm_password: e.target.value })}
                  placeholder="Repita a senha"
                  required
                />
              </div>

              {/* Regime de contratação */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Regime de contratação <span className="text-red-500">*</span>
                </label>
                <div className="flex flex-wrap gap-3">
                  {(['CLT', 'PJ', 'Indiferente'] as const).map((ct) => (
                    <label
                      key={ct}
                      className={[
                        'flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors',
                        form.desired_contract_type === ct
                          ? 'border-primary-700 bg-primary-50 text-primary-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-primary-700/40',
                      ].join(' ')}
                    >
                      <input
                        type="radio"
                        name="contract_type"
                        value={ct}
                        checked={form.desired_contract_type === ct}
                        onChange={() => update({ desired_contract_type: ct })}
                        className="sr-only"
                      />
                      {ct}
                    </label>
                  ))}
                </div>
              </div>

              {/* Grupo Marajó */}
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <input
                  type="checkbox"
                  checked={form.works_at_marajo_group}
                  onChange={(e) => update({ works_at_marajo_group: e.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-700 focus:ring-primary-700/20"
                />
                <span className="text-sm text-gray-700">
                  Trabalho (ou trabalhei) em alguma empresa do Grupo Marajó
                </span>
              </label>

              {stepError && (
                <p className="flex items-center gap-1.5 text-sm text-red-600">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {stepError}
                </p>
              )}

              <div className="flex justify-end pt-2">
                <Button onClick={() => advance(2, validateStep1)}>
                  Próximo
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 2: upload do currículo ──────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Upload do currículo</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Envie seu currículo atualizado em PDF, DOC ou DOCX (máx. 10 MB).
                </p>
              </div>

              <label className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 p-8 transition-colors hover:border-primary-700/40 hover:bg-primary-50/30">
                {form.resume_file ? (
                  <>
                    <CheckCircle2 className="h-10 w-10 text-green-500" />
                    <p className="text-sm font-semibold text-green-700">{form.resume_file.name}</p>
                    <p className="text-xs text-gray-400">Clique para trocar o arquivo</p>
                  </>
                ) : (
                  <>
                    <Upload className="h-10 w-10 text-gray-300" />
                    <p className="text-sm font-medium text-gray-600">
                      Clique para selecionar ou arraste aqui
                    </p>
                    <p className="text-xs text-gray-400">PDF, DOC, DOCX até 10 MB</p>
                  </>
                )}
                <input
                  type="file"
                  accept=".pdf,.doc,.docx"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    update({ resume_file: file });
                  }}
                />
              </label>

              {stepError && (
                <p className="flex items-center gap-1.5 text-sm text-red-600">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {stepError}
                </p>
              )}

              <div className="flex justify-between pt-2">
                <Button
                  variant="secondary"
                  onClick={() => { setStepError(null); setStep(1); }}
                >
                  Voltar
                </Button>
                <Button onClick={() => advance(3, validateStep2)}>
                  Próximo
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 3: revisão + LGPD ───────────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Revisar candidatura</h2>
                <p className="mt-1 text-sm text-gray-500">Confira os dados antes de enviar.</p>
              </div>

              <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 space-y-2.5 text-sm">
                <ReviewRow label="Nome" value={form.full_name} />
                <ReviewRow label="CPF" value={form.cpf} />
                <ReviewRow label="E-mail" value={form.email} />
                <ReviewRow label="Telefone" value={form.phone} />
                <ReviewRow
                  label="Cidade / Estado"
                  value={[form.address_city, form.address_state].filter(Boolean).join(', ')}
                />
                {form.salary_expectation && (
                  <ReviewRow label="Pretensão" value={form.salary_expectation} />
                )}
                <ReviewRow label="Regime" value={form.desired_contract_type} />
                <ReviewRow
                  label="Grupo Marajó"
                  value={form.works_at_marajo_group ? 'Sim' : 'Não'}
                />
                <ReviewRow label="Currículo" value={form.resume_file?.name ?? 'Não enviado'} />
              </div>

              {/* LGPD consent */}
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <input
                  type="checkbox"
                  checked={form.lgpd_consent}
                  onChange={(e) => update({ lgpd_consent: e.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-700 focus:ring-primary-700/20"
                />
                <span className="text-sm text-gray-700 leading-relaxed">
                  Autorizo o uso dos meus dados para fins de recrutamento conforme a{' '}
                  <a href="#" className="text-primary-700 hover:underline">
                    Política de Privacidade
                  </a>
                  .
                </span>
              </label>

              {(stepError || apiError) && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
                  <p className="text-sm text-red-700">{stepError ?? apiError}</p>
                </div>
              )}

              <div className="flex justify-between pt-2">
                <Button
                  variant="secondary"
                  onClick={() => { setStepError(null); setApiError(null); setStep(2); }}
                  disabled={submitting}
                >
                  Voltar
                </Button>
                <Button loading={submitting} onClick={() => void handleSubmit()}>
                  Enviar candidatura
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Job sidebar */}
        {job && (
          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <Card padding="md">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
                Vaga selecionada
              </h3>
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 flex-shrink-0 rounded-lg bg-primary-50 flex items-center justify-center">
                  <span className="text-lg">🏢</span>
                </div>
                <div>
                  <p className="font-bold text-gray-900">{job.title}</p>
                  <p className="text-sm text-gray-500">{job.company}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {job.area && JOB_AREA_LABELS[job.area] && (
                      <Badge variant="area">{JOB_AREA_LABELS[job.area]}</Badge>
                    )}
                    {job.work_model && WORK_MODEL_LABELS[job.work_model] && (
                      <Badge variant="model">{WORK_MODEL_LABELS[job.work_model]}</Badge>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          </aside>
        )}
      </div>
    </CandidatePortalLayout>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-2 gap-x-4">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900 break-all">{value || '—'}</span>
    </div>
  );
}
