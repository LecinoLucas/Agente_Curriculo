import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, User, MessageCircle, Briefcase } from 'lucide-react';
import { CandidatePortalLayout } from '../components/layout/CandidatePortalLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { LoadingState } from '../components/shared/LoadingState';
import { ProcessStepper } from '../components/shared/ProcessStepper';
import { StatusCard } from '../components/shared/StatusCard';
import { getCandidateHome } from '../services/mockCandidatePortalService';
import type { MockCandidate } from '../types/candidatePortal';

export function CandidateHomePage() {
  const navigate = useNavigate();
  const [data, setData] = useState<MockCandidate | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void getCandidateHome().then((d) => {
      setData(d);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <CandidatePortalLayout>
        <LoadingState variant="spinner" />
      </CandidatePortalLayout>
    );
  }

  if (!data) return null;

  const activeApp = data.applications[0];
  const unreadMessages = data.messages.filter((m) => !m.read).length;

  return (
    <CandidatePortalLayout maxWidth="page">
      {/* Welcome */}
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-gray-900">
          Bem-vindo à sua área do candidato, {data.name.split(' ')[0]}! 👋
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Acompanhe o status das suas candidaturas e faça o que for solicitado.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          {/* Active application */}
          {activeApp && (
            <Card padding="lg">
              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                    Minha candidatura em andamento
                  </p>
                  <h2 className="text-lg font-bold text-gray-900">{activeApp.job_title}</h2>
                  <p className="text-sm text-gray-500">{activeApp.company}</p>
                </div>
                <span className="flex-shrink-0 rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700">
                  Em andamento
                </span>
              </div>

              <ProcessStepper
                currentStep={activeApp.current_step}
                completedSteps={activeApp.completed_steps}
                variant="full"
              />

              {activeApp.next_action && (
                <div className="mt-5 flex items-center justify-between gap-4 rounded-xl bg-primary-50 border border-primary-100 px-4 py-3">
                  <div>
                    <p className="text-xs font-semibold text-primary-700 uppercase tracking-wide mb-0.5">
                      Próxima ação
                    </p>
                    <p className="text-sm font-medium text-gray-900">{activeApp.next_action}</p>
                  </div>
                  {activeApp.next_action_route && (
                    <Button size="sm" onClick={() => navigate(activeApp.next_action_route!)}>
                      Fazer agora
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              )}
            </Card>
          )}

          {/* Messages */}
          <Card padding="lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="flex items-center gap-2 text-base font-bold text-gray-900">
                <MessageCircle className="h-5 w-5 text-gray-400" />
                Mensagens do RH
                {unreadMessages > 0 && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-700 text-[10px] font-bold text-white">
                    {unreadMessages}
                  </span>
                )}
              </h2>
            </div>
            <div className="space-y-3">
              {data.messages.map((msg) => (
                <StatusCard
                  key={msg.id}
                  message={msg}
                  actionRoute={msg.type === 'action' ? activeApp?.next_action_route : undefined}
                  actionLabel={msg.type === 'action' ? 'Responder agora' : undefined}
                />
              ))}
            </div>
          </Card>
        </div>

        {/* Sidebar */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {/* Profile card */}
          <Card padding="md">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-100">
                <User className="h-6 w-6 text-primary-700" />
              </div>
              <div>
                <p className="font-bold text-gray-900 text-sm">{data.profile.name}</p>
                <p className="text-xs text-gray-500">{data.profile.email}</p>
              </div>
            </div>

            <div className="mb-3">
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-gray-500">Perfil completo</span>
                <span className="font-semibold text-gray-900">{data.profile.profile_completion}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-primary-700 transition-all"
                  style={{ width: `${data.profile.profile_completion}%` }}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              {data.profile.profile_items.map((item) => (
                <div key={item.label} className="flex items-center gap-2 text-xs">
                  <div
                    className={[
                      'h-4 w-4 rounded-full flex items-center justify-center flex-shrink-0',
                      item.done ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400',
                    ].join(' ')}
                  >
                    {item.done ? '✓' : '○'}
                  </div>
                  <span className={item.done ? 'text-gray-700' : 'text-gray-400'}>{item.label}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* All applications link */}
          <Card padding="md">
            <div className="flex items-center gap-3">
              <Briefcase className="h-5 w-5 text-gray-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">
                  {data.applications.length} candidatura{data.applications.length !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-gray-500">em andamento</p>
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </CandidatePortalLayout>
  );
}
