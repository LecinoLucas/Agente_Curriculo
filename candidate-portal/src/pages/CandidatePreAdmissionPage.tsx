import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import { CandidatePortalLayout } from '../components/layout/CandidatePortalLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { LoadingState } from '../components/shared/LoadingState';
import { DocumentChecklist } from '../components/shared/DocumentChecklist';
import { getPreAdmissionDocuments } from '../services/mockCandidatePortalService';
import { MOCK_CANDIDATE } from '../data/mockCandidatePortal';
import type { DocumentItem } from '../types/candidatePortal';

export function CandidatePreAdmissionPage() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void getPreAdmissionDocuments().then((data) => {
      setDocuments(data);
      setLoading(false);
    });
  }, []);

  function handleDocumentUploaded(docId: string, fileName: string) {
    setDocuments((prev) =>
      prev.map((doc) =>
        doc.id === docId
          ? { ...doc, status: 'enviado' as const, file_name: fileName }
          : doc,
      ),
    );
  }

  const sent = documents.filter((d) => d.status === 'enviado' || d.status === 'aprovado').length;
  const approved = documents.filter((d) => d.status === 'aprovado').length;
  const total = documents.length;
  const progress = total > 0 ? Math.round((sent / total) * 100) : 0;

  const activeApp = MOCK_CANDIDATE.applications[0];

  const NEXT_STEPS = [
    { label: 'Envio de documentos', done: sent > 0 },
    { label: 'Análise do RH', done: approved > 0 },
    { label: 'Entrevista final', done: false },
    { label: 'Contratação', done: false },
  ];

  if (loading) {
    return (
      <CandidatePortalLayout>
        <LoadingState variant="spinner" />
      </CandidatePortalLayout>
    );
  }

  return (
    <CandidatePortalLayout maxWidth="page">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-gray-900">Pré-admissão</h1>
        <p className="mt-1 text-sm text-gray-500">
          Envie os documentos abaixo para avançar no processo.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        {/* Documents */}
        <div className="space-y-6">
          <Card padding="md">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-700">
                {sent} de {total} documentos enviados
              </p>
              <span className="text-sm font-bold text-primary-700">{progress}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-primary-700 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </Card>

          <DocumentChecklist
            documents={documents}
            onDocumentUploaded={handleDocumentUploaded}
          />

          {sent >= documents.filter((d) => d.required).length && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                <p className="text-sm font-semibold text-green-800">
                  Todos os documentos obrigatórios foram enviados!
                </p>
              </div>
              <p className="mt-1 pl-7 text-xs text-green-700">
                Aguarde a análise do RH. Você será notificado sobre qualquer pendência.
              </p>
            </div>
          )}

          <div className="flex justify-between">
            <Button variant="secondary" onClick={() => navigate('/minha-area')}>
              Voltar à minha área
            </Button>
            <Button
              disabled={sent < documents.filter((d) => d.required).length}
              onClick={() => navigate('/minha-area')}
            >
              Avançar no processo
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Sidebar */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card padding="md">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
              Seu progresso
            </p>
            <div className="flex flex-col items-center py-2">
              <div className="relative flex h-20 w-20 items-center justify-center rounded-full border-4 border-primary-700">
                <div className="text-center">
                  <span className="block text-2xl font-extrabold text-primary-700">{sent}</span>
                  <span className="block text-[10px] text-gray-400 leading-tight">de {total}</span>
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-500">documentos enviados</p>
            </div>
          </Card>

          <Card padding="md">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
              Próximos passos
            </p>
            <div className="space-y-2.5">
              {NEXT_STEPS.map((step, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div
                    className={[
                      'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                      step.done
                        ? 'bg-primary-700 text-white'
                        : 'border-2 border-gray-200 bg-white text-gray-400',
                    ].join(' ')}
                  >
                    {step.done ? '✓' : i + 1}
                  </div>
                  <span
                    className={[
                      'text-sm',
                      step.done ? 'text-gray-700 font-medium' : 'text-gray-400',
                    ].join(' ')}
                  >
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card padding="md">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
              Vaga
            </p>
            <p className="font-bold text-gray-900 text-sm">{activeApp.job_title}</p>
            <p className="text-xs text-gray-500">{activeApp.company}</p>
          </Card>
        </aside>
      </div>
    </CandidatePortalLayout>
  );
}
