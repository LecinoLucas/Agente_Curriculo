import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck, Loader2, Search, UserCheck, Users } from "lucide-react";

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
import { EmptyState } from "../components/common/EmptyState";
import { PageHeader } from "../components/common/PageHeader";
import { admittedCandidatesService } from "../services/admittedCandidatesService";
import type { AdmittedCandidate, AdmittedCandidatesSummary } from "../types/domain";

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

function MetricCard({
  label,
  value,
  helper,
  icon,
}: {
  label: string;
  value: string;
  helper: string;
  icon: ReactNode;
}) {
  return (
    <Card className="overflow-hidden border-border bg-surface">
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
            {label}
          </p>
          <strong className="mt-2 block text-2xl font-semibold text-text">
            {value}
          </strong>
          <span className="mt-1 block text-sm text-text-muted">{helper}</span>
        </div>
        <span className="rounded-2xl border border-border bg-surface-muted p-3 text-[hsl(var(--primary))]">
          {icon}
        </span>
      </CardContent>
    </Card>
  );
}

export function AdmitidosPage() {
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
        />
        <MetricCard
          label="Admitidos no mês"
          value={String(summary.admitted_this_month)}
          helper="Considerando a data de conclusão"
          icon={<CalendarCheck className="h-5 w-5" aria-hidden="true" />}
        />
        <MetricCard
          label="Última admissão"
          value={latestAdmission}
          helper="Último processo concluído"
          icon={<UserCheck className="h-5 w-5" aria-hidden="true" />}
        />
      </section>

      <Card className="border-border">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex w-full flex-col gap-3 md:max-w-2xl md:flex-row">
              <label className="relative block w-full md:max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                <Input
                  value={search}
                  onChange={(event) => {
                    setPage(1);
                    setSearch(event.target.value);
                  }}
                  placeholder="Buscar por candidato ou vaga"
                  className="pl-9"
                  aria-label="Buscar por candidato ou vaga"
                />
              </label>
              <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtrar por status">
                {[
                  { value: "all", label: "Todos" },
                  { value: "admitted", label: "Admitidos" },
                  { value: "dismissed", label: "Desligados" },
                ].map((filter) => (
                  <Button
                    key={filter.value}
                    type="button"
                    size="sm"
                    variant={statusFilter === filter.value ? "default" : "outline"}
                    onClick={() => {
                      setPage(1);
                      setStatusFilter(filter.value as AdmittedStatusFilter);
                    }}
                  >
                    {filter.label}
                  </Button>
                ))}
              </div>
            </div>
            <span className="text-sm text-text-muted">
              Página {page} de {totalPages}
            </span>
          </div>

          {error ? (
            <EmptyState icon="!" title="Erro ao carregar" description={error} />
          ) : loading ? (
            <div className="py-14 text-center text-sm text-text-muted">
              Carregando admitidos...
            </div>
          ) : items.length === 0 ? (
            <EmptyState icon="✓" title={emptyTitle} description={emptyDescription} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidato</TableHead>
                  <TableHead>Vaga</TableHead>
                  <TableHead>Data de admissão</TableHead>
                  <TableHead>Início previsto</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.admission_case_id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-text">{item.candidate_name}</p>
                        {item.candidate_email ? (
                          <p className="text-xs text-text-muted">{item.candidate_email}</p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>{item.job_title}</TableCell>
                    <TableCell>{formatDate(item.admitted_at)}</TableCell>
                    <TableCell>{formatDate(item.start_date)}</TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(item.admission_status)}>
                        {statusLabel(item.admission_status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button asChild variant="outline" size="sm">
                          <Link to={`/candidatos/${item.candidate_id}`}>Ver candidato</Link>
                        </Button>
                        <Button asChild variant="outline" size="sm">
                          <Link to={`/admissao/${item.admission_case_id}`}>Ver admissão</Link>
                        </Button>
                        <Button asChild variant="ghost" size="sm">
                          <Link to={`/candidatos/${item.candidate_id}?tab=history`}>
                            Ver histórico
                          </Link>
                        </Button>
                        {item.admission_status === "admitted" ? (
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              setDismissTarget(item);
                              setDismissReason("");
                              setDismissError(null);
                            }}
                          >
                            Marcar como desligado
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Anterior
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || page >= totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            >
              Próxima
            </Button>
          </div>
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
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-[hsl(var(--primary))]"
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
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void handleConfirmDismiss()}
                disabled={dismissing}
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
