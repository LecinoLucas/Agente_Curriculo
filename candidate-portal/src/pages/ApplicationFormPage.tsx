import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ChevronRight, Upload, CheckCircle2 } from 'lucide-react';
import { CandidatePortalLayout } from '../components/layout/CandidatePortalLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { LoadingState } from '../components/shared/LoadingState';
import { getPublicJobBySlug, submitMockApplication } from '../services/mockCandidatePortalService';
import type { PublicJob, ApplicationFormData } from '../types/candidatePortal';
import { JOB_AREA_LABELS, WORK_MODEL_LABELS } from '../types/candidatePortal';

type FormStep = 1 | 2 | 3;

const STEPS = [
  { id: 1, label: 'Dados pessoais' },
  { id: 2, label: 'Currículo' },
  { id: 3, label: 'Revisão' },
];

const INITIAL_FORM: ApplicationFormData = {
  full_name: '',
  email: '',
  phone: '',
  birth_date: '',
  nationality: 'Brasileiro(a)',
  address_city: '',
  address_state: '',
  education_level: '',
  salary_expectation: '',
  resume_file_name: undefined,
};

export function ApplicationFormPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<PublicJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<FormStep>(1);
  const [form, setForm] = useState<ApplicationFormData>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!slug) return;
    void getPublicJobBySlug(slug).then((data) => {
      setJob(data);
      setLoading(false);
    });
  }, [slug]);

  function updateForm(updates: Partial<ApplicationFormData>) {
    setForm((prev) => ({ ...prev, ...updates }));
  }

  async function handleSubmit() {
    if (!slug) return;
    setSubmitting(true);
    await submitMockApplication(slug, form);
    setSubmitting(false);
    navigate('/sucesso');
  }

  if (loading) {
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
        <Link to={`/vagas/${slug}`} className="hover:text-primary-700 transition-colors">
          {job?.title ?? slug}
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
                <div className={['flex-1 h-0.5 mb-5', step > s.id ? 'bg-primary-700' : 'bg-gray-200'].join(' ')} />
              )}
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Form */}
        <Card padding="lg">
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-xl font-bold text-gray-900">
                Candidatar-se para {job?.title}
              </h2>
              <p className="text-sm text-gray-500">
                Preencha seus dados pessoais para iniciar a candidatura.
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Input
                    label="Nome completo"
                    value={form.full_name}
                    onChange={(e) => updateForm({ full_name: e.target.value })}
                    placeholder="Seu nome completo"
                    required
                  />
                </div>
                <Input
                  label="Data de nascimento"
                  type="date"
                  value={form.birth_date}
                  onChange={(e) => updateForm({ birth_date: e.target.value })}
                  required
                />
                <Input
                  label="Nacionalidade"
                  value={form.nationality}
                  onChange={(e) => updateForm({ nationality: e.target.value })}
                />
                <Input
                  label="E-mail"
                  type="email"
                  value={form.email}
                  onChange={(e) => updateForm({ email: e.target.value })}
                  placeholder="seu@email.com"
                  required
                />
                <Input
                  label="Telefone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => updateForm({ phone: e.target.value })}
                  placeholder="(62) 9 0000-0000"
                  required
                />
                <Input
                  label="Cidade"
                  value={form.address_city}
                  onChange={(e) => updateForm({ address_city: e.target.value })}
                  placeholder="Goiânia"
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Estado</label>
                  <select
                    value={form.address_state}
                    onChange={(e) => updateForm({ address_state: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 focus:border-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-700/20"
                  >
                    <option value="">Selecione</option>
                    {['GO', 'SP', 'RJ', 'MG', 'BA', 'RS', 'PR', 'SC'].map((uf) => (
                      <option key={uf} value={uf}>{uf}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Escolaridade</label>
                  <select
                    value={form.education_level}
                    onChange={(e) => updateForm({ education_level: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 focus:border-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-700/20"
                  >
                    <option value="">Selecione</option>
                    <option value="ensino_fundamental">Ensino Fundamental</option>
                    <option value="ensino_medio">Ensino Médio</option>
                    <option value="superior_incompleto">Superior Incompleto</option>
                    <option value="superior_completo">Superior Completo</option>
                    <option value="pos_graduacao">Pós-graduação</option>
                  </select>
                </div>
                <Input
                  label="Pretensão salarial"
                  value={form.salary_expectation}
                  onChange={(e) => updateForm({ salary_expectation: e.target.value })}
                  placeholder="R$ 0,00"
                />
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={() => setStep(2)}>
                  Próximo
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <h2 className="text-xl font-bold text-gray-900">Upload do currículo</h2>
              <p className="text-sm text-gray-500">
                Envie seu currículo atualizado em PDF, DOC ou DOCX.
              </p>

              <label className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 p-8 transition-colors hover:border-primary-700/40 hover:bg-primary-50/30">
                {form.resume_file_name ? (
                  <>
                    <CheckCircle2 className="h-10 w-10 text-green-500" />
                    <p className="text-sm font-semibold text-green-700">{form.resume_file_name}</p>
                    <p className="text-xs text-gray-400">Clique para trocar o arquivo</p>
                  </>
                ) : (
                  <>
                    <Upload className="h-10 w-10 text-gray-300" />
                    <p className="text-sm font-medium text-gray-600">Clique para selecionar ou arraste aqui</p>
                    <p className="text-xs text-gray-400">PDF, DOC, DOCX até 5MB</p>
                  </>
                )}
                <input
                  type="file"
                  accept=".pdf,.doc,.docx"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) updateForm({ resume_file_name: file.name });
                  }}
                />
              </label>

              <div className="flex justify-between pt-2">
                <Button variant="secondary" onClick={() => setStep(1)}>
                  Voltar
                </Button>
                <Button onClick={() => setStep(3)}>
                  Próximo
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-xl font-bold text-gray-900">Revisar candidatura</h2>
              <p className="text-sm text-gray-500">
                Confira os dados antes de enviar.
              </p>

              <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-y-2">
                  <span className="text-gray-500">Nome</span>
                  <span className="font-medium text-gray-900">{form.full_name || '—'}</span>
                  <span className="text-gray-500">E-mail</span>
                  <span className="font-medium text-gray-900">{form.email || '—'}</span>
                  <span className="text-gray-500">Telefone</span>
                  <span className="font-medium text-gray-900">{form.phone || '—'}</span>
                  <span className="text-gray-500">Cidade</span>
                  <span className="font-medium text-gray-900">
                    {[form.address_city, form.address_state].filter(Boolean).join(', ') || '—'}
                  </span>
                  <span className="text-gray-500">Currículo</span>
                  <span className="font-medium text-gray-900">{form.resume_file_name || 'Não enviado'}</span>
                </div>
              </div>

              <p className="text-xs text-gray-400 leading-relaxed">
                Ao enviar, você autoriza o uso dos seus dados para fins de recrutamento conforme nossa{' '}
                <a href="#" className="text-primary-700 hover:underline">Política de Privacidade</a>.
              </p>

              <div className="flex justify-between pt-2">
                <Button variant="secondary" onClick={() => setStep(2)}>
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
                    <Badge variant="area">{JOB_AREA_LABELS[job.area]}</Badge>
                    <Badge variant="model">{WORK_MODEL_LABELS[job.work_model]}</Badge>
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
