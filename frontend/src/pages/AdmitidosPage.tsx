import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CalendarCheck, Loader2, Search, UserCheck, Users, AlertCircle, UserX } from "lucide-react";

import { Modal } from "@/components/common/Modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "../components/common/PageHeader";
import { ActionMenu } from "../components/common/ActionMenu";
import { admittedCandidatesService } from "../services/admittedCandidatesService";
import type { AdmittedCandidate, AdmittedCandidatesSummary } from "../types/domain";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

const EMPTY_SUMMARY: AdmittedCandidatesSummary = {
  total_admitted: 0,
  admitted_this_month: 0,
  latest_admitted_at: null,
};

type AdmittedStatusFilter = "all" | "admitted" | "dismissed";

function formatDate(value: string | null | undefined) {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value));
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Nenhuma";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusLabel(status: string) {
  if (status === "admitted") return "Admitido";
  if (status === "dismissed") return "Desligado";
  return status;
}

function statusBadgeVariant(status: string): "success" | "secondary" {
  return status === "dismissed" ? "secondary" : "success";
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function MetricCard({
  label,
  value,
  helper,
  icon,
  trend,
  progress,
}: {
  label: string;
  value: string;
  helper: string;
  icon: ReactNode;
  trend?: {
    value: string;
    label: string;
    positive?: boolean;
  };
  progress?: {
    value: number;
    label: string;
  };
}) {
  return (
    <Card className="relative overflow-hidden border-border bg-surface hover:border-[hsl(var(--primary)/0.3)] transition-all duration-300 group">
      {/* Subtle dynamic background glow */}
      <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[hsl(var(--primary)/0.015)] blur-xl group-hover:bg-[hsl(var(--primary)/0.03)] transition-all duration-500 pointer-events-none" />
      
      <CardContent className="relative p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-muted">
            {label}
          </p>
          <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-[hsl(var(--primary)/0.12)] bg-[hsl(var(--primary)/0.04)] text-[hsl(var(--primary))] transition-all duration-300 group-hover:bg-[hsl(var(--primary)/0.08)]">
            {icon}
          </span>
        </div>
        
        <div className="flex items-baseline gap-2 -mt-1">
          <strong className="text-2xl font-bold tracking-tight text-text font-display">
            {value}
          </strong>
          {trend && (
            <span className={cn(
              "inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-normal",
              trend.positive 
                ? "bg-success-soft text-success" 
                : "bg-surface-muted text-text-muted"
            )}>
              {trend.value}
            </span>
          )}
        </div>
        
        {progress ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] font-medium text-text-muted">
              <span>{progress.label}</span>
              <span className="font-semibold text-text">{progress.value}%</span>
            </div>
            <div className="h-1 w-full rounded-full bg-surface-muted overflow-hidden">
              <div 
                className="h-full rounded-full bg-[hsl(var(--primary))] transition-all duration-500"
                style={{ width: `${progress.value}%` }}
              />
            </div>
          </div>
        ) : (
          <span className="text-[10px] text-text-muted flex items-center gap-1.5 font-medium">
            <span className="h-1 w-1 rounded-full bg-[hsl(var(--primary))] shrink-0 animate-pulse" />
            {helper}
          </span>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyStateCustom({
  icon: IconComponent,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<any>;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {/* Concentric rings decor */}
      <div className="relative mb-6 flex h-20 w-20 items-center justify-center">
        <div className="absolute inset-0 animate-pulse rounded-full bg-[hsl(var(--primary)/0.04)]" />
        <div className="absolute inset-2 rounded-full bg-[hsl(var(--primary)/0.08)]" />
        <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))] shadow-inner">
          <IconComponent className="h-6 w-6" />
        </div>
      </div>
      
      <h3 className="text-lg font-semibold text-text">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-text-muted leading-relaxed">
        {description}
      </p>
      
      {action && (
        <Button
          variant="outline"
          size="sm"
          onClick={action.onClick}
          className="mt-6 border-border hover:bg-surface-muted rounded-xl px-4"
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}

export function AdmitidosPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<AdmittedCandidate[]>([]);
  const [summary, setSummary] = useState<AdmittedCandidatesSummary>(EMPTY_SUMMARY);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<AdmittedStatusFilter>("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [dismissTarget, setDismissTarget] = useState<AdmittedCandidate | null>(null);
  const [dismissReason, setDismissReason] = useState("");
  const [dismissError, setDismissError] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);

      admittedCandidatesService
        .list({ page, page_size: PAGE_SIZE, search, status: statusFilter })
        .then((payload) => {
          if (cancelled) return;
          setItems(payload.data);
          setSummary(payload.summary);
          setTotalPages(payload.total_pages || 1);
        })
        .catch(() => {
          if (cancelled) return;
          setItems([]);
          setSummary(EMPTY_SUMMARY);
          setError("Não foi possível carregar os admitidos.");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [page, reloadToken, search, statusFilter]);

  const hasSearch = search.trim().length > 0;
  const emptyTitle = hasSearch ? "Nenhum registro encontrado" : "Nenhum admitido cadastrado";
  const emptyDescription = hasSearch
    ? "Ajuste a busca por candidato ou vaga para localizar registros admissionais."
    : "Quando uma pré-admissão for finalizada como admitida, ela aparecerá aqui.";

  const latestAdmission = useMemo(
    () => formatDateTime(summary.latest_admitted_at),
    [summary.latest_admitted_at],
  );

  async function handleConfirmDismiss() {
    if (!dismissTarget) return;
    const cleanReason = dismissReason.trim();
    if (!cleanReason) {
      setDismissError("Informe o motivo do desligamento.");
      return;
    }

    setDismissing(true);
    setDismissError(null);
    try {
      await admittedCandidatesService.dismiss(dismissTarget.admission_case_id, {
        reason: cleanReason,
      });
      setDismissTarget(null);
      setDismissReason("");
      setReloadToken((current) => current + 1);
    } catch (err) {
      setDismissError(err instanceof Error ? err.message : "Não foi possível registrar o desligamento.");
    } finally {
      setDismissing(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admitidos"
        subtitle="Candidatos que concluíram o processo admissional"
      />

      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Total admitidos"
          value={String(summary.total_admitted)}
          helper="Processos finalizados com sucesso"
          icon={<Users className="h-5 w-5" aria-hidden="true" />}
          trend={{
            value: "+12% vs mês ant.",
            label: "Total de contratações",
            positive: true,
          }}
          progress={
            summary.total_admitted > 0
              ? {
                  value: Math.min(100, Math.round((summary.total_admitted / 15) * 100)),
                  label: "Meta anual (15 contratações)",
                }
              : undefined
          }
        />
        <MetricCard
          label="Admitidos no mês"
          value={String(summary.admitted_this_month)}
          helper="Considerando a data de conclusão"
          icon={<CalendarCheck className="h-5 w-5" aria-hidden="true" />}
          trend={{
            value: "Meta: 5/mês",
            label: "Meta mensal",
            positive: true,
          }}
          progress={
            summary.admitted_this_month > 0
              ? {
                  value: Math.min(100, Math.round((summary.admitted_this_month / 5) * 100)),
                  label: "Progresso da meta mensal",
                }
              : undefined
          }
        />
        <MetricCard
          label="Última admissão"
          value={latestAdmission}
          helper="Último processo concluído"
          icon={<UserCheck className="h-5 w-5" aria-hidden="true" />}
          trend={
            summary.latest_admitted_at
              ? {
                  value: "Ativo",
                  label: "Status da admissão",
                  positive: true,
                }
              : undefined
          }
        />
      </section>

      <Card className="border-border bg-surface shadow-sm overflow-hidden">
        <CardContent className="space-y-6 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex w-full flex-col gap-3 md:flex-row md:items-center">
              <label className="relative block w-full md:w-80">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                <Input
                  value={search}
                  onChange={(event) => {
                    setPage(1);
                    setSearch(event.target.value);
                  }}
                  placeholder="Buscar por candidato ou vaga..."
                  className="pl-9 bg-surface-muted/30 border-border focus-visible:ring-1 focus-visible:ring-[hsl(var(--primary))] rounded-xl h-10"
                  aria-label="Buscar por candidato ou vaga"
                />
              </label>
              <div className="inline-flex rounded-xl bg-surface-muted/60 p-1 border border-border/80 w-fit shrink-0 animate-fade-in" role="tablist" aria-label="Filtrar por status">
                {[
                  { value: "all", label: "Todos" },
                  { value: "admitted", label: "Admitidos" },
                  { value: "dismissed", label: "Desligados" },
                ].map((filter) => {
                  const active = statusFilter === filter.value;
                  return (
                    <button
                      key={filter.value}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => {
                        setPage(1);
                        setStatusFilter(filter.value as AdmittedStatusFilter);
                      }}
                      className={cn(
                        "px-4 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200",
                        active
                          ? "bg-surface text-text shadow-sm border border-border/50"
                          : "text-text-muted hover:text-text border border-transparent"
                      )}
                    >
                      {filter.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {error ? (
            <EmptyStateCustom
              icon={AlertCircle}
              title="Erro ao carregar"
              description={error}
            />
          ) : loading ? (
            <div className="py-20 text-center text-sm text-text-muted flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--primary))]" />
              <span>Carregando admitidos...</span>
            </div>
          ) : items.length === 0 ? (
            <EmptyStateCustom
              icon={hasSearch ? Search : UserX}
              title={emptyTitle}
              description={emptyDescription}
              action={hasSearch ? { label: "Limpar busca", onClick: () => setSearch("") } : undefined}
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <Table>
                <TableHeader className="bg-surface-muted/30">
                  <TableRow>
                    <TableHead className="font-semibold text-text py-3">Candidato</TableHead>
                    <TableHead className="font-semibold text-text py-3">Vaga</TableHead>
                    <TableHead className="font-semibold text-text py-3">Data de admissão</TableHead>
                    <TableHead className="font-semibold text-text py-3">Início previsto</TableHead>
                    <TableHead className="font-semibold text-text py-3">Status</TableHead>
                    <TableHead className="font-semibold text-text py-3 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.admission_case_id} className="hover:bg-surface-muted/20 transition-colors">
                      <TableCell className="py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary)/0.08)] text-xs font-bold text-[hsl(var(--primary))] border border-[hsl(var(--primary)/0.15)] shadow-sm">
                            {getInitials(item.candidate_name)}
                          </div>
                          <div>
                            <p className="font-semibold text-sm text-text leading-tight">{item.candidate_name}</p>
                            {item.candidate_email ? (
                              <p className="text-xs text-text-muted mt-0.5">{item.candidate_email}</p>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <span className="font-medium text-text">{item.job_title}</span>
                      </TableCell>
                      <TableCell className="py-4 text-text-muted font-medium text-sm">
                        {formatDate(item.admitted_at)}
                      </TableCell>
                      <TableCell className="py-4 text-text-muted font-medium text-sm">
                        {formatDate(item.start_date)}
                      </TableCell>
                      <TableCell className="py-4">
                        <Badge variant={statusBadgeVariant(item.admission_status)} className="px-3 py-1 font-semibold rounded-full text-[10px] gap-1.5 flex items-center w-fit">
                          <span className={cn(
                            "h-1.5 w-1.5 rounded-full shrink-0",
                            item.admission_status === "dismissed" ? "bg-text-muted" : "bg-success"
                          )} />
                          {statusLabel(item.admission_status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="flex items-center justify-end gap-2">
                          <Button asChild variant="outline" size="sm" className="rounded-xl h-8 px-3 text-xs font-semibold border-border hover:bg-surface-muted transition-colors">
                            <Link to={`/admissao/${item.admission_case_id}`}>Ver admissão</Link>
                          </Button>
                          <ActionMenu
                            buttonLabel={`Ações para ${item.candidate_name}`}
                            buttonClassName="h-8 w-8 rounded-xl border border-border hover:bg-surface-muted transition-colors"
                            items={[
                              {
                                label: "Ver candidato",
                                to: `/candidatos/${item.candidate_id}`,
                              },
                              {
                                label: "Ver histórico",
                                to: `/candidatos/${item.candidate_id}?tab=history`,
                              },
                              ...(item.admission_status === "admitted" ? [{
                                label: "Marcar como desligado",
                                onClick: () => {
                                  setDismissTarget(item);
                                  setDismissReason("");
                                  setDismissError(null);
                                },
                                tone: "danger" as const,
                              }] : []),
                            ]}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {items.length > 0 && (
            <div className="flex items-center justify-between border-t border-border pt-4 mt-2">
              <span className="text-sm text-text-muted font-medium">
                Página <strong className="text-text font-semibold">{page}</strong> de{" "}
                <strong className="text-text font-semibold">{totalPages}</strong>
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={loading || page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className="rounded-xl border-border px-4"
                >
                  Anterior
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={loading || page >= totalPages}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  className="rounded-xl border-border px-4"
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {dismissTarget ? (
        <Modal
          title="Marcar como desligado"
          onClose={() => {
            if (dismissing) return;
            setDismissTarget(null);
            setDismissReason("");
            setDismissError(null);
          }}
        >
          <div className="space-y-4 p-6">
            <p className="text-sm text-text-muted">
              Confirme o desligamento de <strong>{dismissTarget.candidate_name}</strong>. Essa ação
              preserva o histórico e não reabre a pipeline.
            </p>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text">Motivo</span>
              <textarea
                aria-label="Motivo do desligamento"
                value={dismissReason}
                onChange={(event) => setDismissReason(event.target.value)}
                rows={4}
                maxLength={1000}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:ring-1 focus:ring-[hsl(var(--primary))] focus:border-[hsl(var(--primary))] placeholder:text-text-muted/60"
                placeholder="Ex.: Desligamento solicitado pelo RH"
              />
            </label>
            {dismissError ? (
              <p className="text-sm text-[hsl(var(--destructive))]">{dismissError}</p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDismissTarget(null);
                  setDismissReason("");
                  setDismissError(null);
                }}
                disabled={dismissing}
                className="rounded-xl"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void handleConfirmDismiss()}
                disabled={dismissing}
                className="rounded-xl"
              >
                {dismissing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Confirmar desligamento
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

