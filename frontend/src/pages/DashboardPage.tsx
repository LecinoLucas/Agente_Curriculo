import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { Card } from "../components/common/Card";
import { EmptyState } from "../components/common/EmptyState";
import { PageHeader } from "../components/common/PageHeader";
import { SkeletonCards, SkeletonRows } from "../components/common/Skeleton";
import { StatusPill } from "../components/common/StatusPill";
import { useAsyncState } from "../hooks/useAsyncState";
import { loadDashboardSummary } from "../services/dashboardService";

function jobStatusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "published") return "success";
  if (status === "closed" || status === "cancelled") return "danger";
  return "warning";
}

function analysisStatusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "completed") return "success";
  if (status === "failed" || status === "cancelled") return "danger";
  return "warning";
}

function formatAnalysisStatus(status: string): string {
  const labels: Record<string, string> = {
    pending: "Na fila",
    processing: "Processando",
    completed: "Concluída",
    failed: "Falhou",
    cancelled: "Cancelada",
  };
  return labels[status] ?? status;
}

function formatJobStatus(status: string): string {
  const labels: Record<string, string> = {
    draft: "Rascunho",
    published: "Publicada",
    paused: "Pausada",
    closed: "Encerrada",
    cancelled: "Cancelada",
  };
  return labels[status] ?? status;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { data, error, loading, run } = useAsyncState<Awaited<ReturnType<typeof loadDashboardSummary>>>();

  useEffect(() => {
    void run(loadDashboardSummary);
  }, [run]);

  return (
    <div className="page-grid">
      <PageHeader title="Visão geral" subtitle="Resumo do pipeline de recrutamento, documentos e análises recentes" />

      {error ? (
        <div className="page-error">
          <span className="page-error-icon">✕</span>
          <span>{error}</span>
        </div>
      ) : null}

      {loading ? (
        <>
          <SkeletonCards count={2} columns={2} />
          <SkeletonCards count={4} columns={4} />
        </>
      ) : null}

      {data ? (
        <>
          <div className="stats-hero">
            <div className="card card-hero">
              <div className="card-header">
                <h3>Oportunidades em andamento</h3>
              </div>
              <strong className="metric-hero">{data.jobsCount}</strong>
              <span className="metric-label">vagas registradas na base</span>
            </div>
            <div className="card card-hero">
              <div className="card-header">
                <h3>Fila de análise</h3>
              </div>
              <strong className="metric-hero">{data.pendingAnalysesCount}</strong>
              <span className="metric-label">análises aguardando ou em processamento</span>
            </div>
          </div>

          <div className="stats-secondary">
            <Card title="Análises registradas">
              <strong className="metric">{data.analysesCount}</strong>
            </Card>
            <Card title="Concluídas recentemente">
              <strong className="metric">{data.completedAnalysesCount}</strong>
            </Card>
            <Card title="Seu perfil">
              <StatusPill
                label={
                  data.user.role === "admin"
                    ? "Administrador"
                    : data.user.role === "recruiter"
                      ? "Recrutador"
                      : data.user.role === "candidate"
                        ? "Candidato"
                        : "Visualizador"
                }
                tone="success"
              />
            </Card>
            <Card title="Situação da conta">
              <StatusPill
                label={data.user.status === "active" ? "Ativa" : data.user.status}
                tone={data.user.status === "active" ? "success" : "warning"}
              />
            </Card>
          </div>

          <Card title="Vagas recentes" description="Oportunidades que merecem atenção agora">
            {data.jobs.length === 0 ? (
              <EmptyState
                icon="📋"
                title="Nenhuma vaga cadastrada"
                description="Crie a primeira vaga para começar o processo de recrutamento."
                action={{ label: "+ Criar vaga", onClick: () => navigate("/vagas") }}
              />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Título</th>
                    <th>Status</th>
                    <th>Perfil</th>
                  </tr>
                </thead>
                <tbody>
                  {data.jobs.slice(0, 5).map((job) => (
                    <tr key={job.id}>
                      <td>
                        <div>{job.title ?? "—"}</div>
                        <div className="text-muted" style={{ fontSize: 12 }}>
                          {job.location ?? "Local não informado"}
                        </div>
                      </td>
                      <td>
                        {job.status ? (
                          <StatusPill label={formatJobStatus(job.status)} tone={jobStatusTone(job.status)} />
                        ) : "—"}
                      </td>
                      <td className="text-muted">{job.seniority_level ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card title="Análises recentes" description="Últimos currículos processados no pipeline">
            {data.recentAnalyses.length === 0 ? (
              <EmptyState
                icon="🔍"
                title="Nenhuma análise ainda"
                description="Faça o upload de um currículo e solicite a primeira análise."
                action={{ label: "Ir para Currículos", onClick: () => navigate("/curriculos") }}
              />
            ) : (
              <>
                {loading ? <SkeletonRows rows={3} /> : null}
                <table className="table">
                  <thead>
                    <tr>
                      <th>Candidato</th>
                      <th>Currículo</th>
                      <th>Status</th>
                      <th>Atualizada em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentAnalyses.map((analysis) => (
                      <tr key={analysis.id}>
                        <td>
                          <div>{analysis.candidate_name ?? "Candidato não identificado"}</div>
                          <div className="text-muted" style={{ fontSize: 12 }}>
                            Ref. {analysis.id.slice(0, 8)}…
                          </div>
                        </td>
                        <td>
                          <div>{analysis.resume_title ?? "Currículo sem título"}</div>
                          <div className="text-muted" style={{ fontSize: 12 }}>
                            {analysis.resume_file_name ?? analysis.resume_version_id.slice(0, 8) + "…"}
                          </div>
                        </td>
                        <td>
                          <StatusPill
                            label={formatAnalysisStatus(analysis.status)}
                            tone={analysisStatusTone(analysis.status)}
                          />
                        </td>
                        <td>{new Date(analysis.updated_at).toLocaleString("pt-BR")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
