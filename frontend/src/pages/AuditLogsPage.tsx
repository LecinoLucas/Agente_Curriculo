import { useEffect, useState } from "react";
import { FileSearch } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CrudPage } from "../components/common/CrudPage";
import { Modal } from "../components/common/Modal";
import { PageHeader } from "../components/common/PageHeader";
import { useAsyncState } from "../hooks/useAsyncState";
import { AuditLogItem, auditLogsService } from "../services/auditLogsService";
import { usersService } from "../services/usersService";
import { getAuditActionLabel, getAuditDetailSummary, getAuditEntityLabel, getAuditHighlightedMetadata, getAuditUserLabel, getAuditUserSecondaryLabel } from "../features/admin/utils/auditLabels";
import { filterSelectCls, inputCls } from "../features/users/utils/userFormatters";

const ACTION_OPTIONS = [
  "archive_job",
  "restore_job",
  "discard_analysis",
  "create_skill",
  "update_skill",
  "deactivate_skill",
  "activate_skill",
  "archive_skill",
  "restore_skill",
  "create_job_area",
  "update_job_area",
  "activate_job_area",
  "deactivate_job_area",
  "delete_job_area",
  "archive_candidate",
  "restore_candidate",
];

const ENTITY_TYPE_OPTIONS = ["job", "analysis", "skill_catalog", "job_area", "candidate"];
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

type UserOption = {
  id: string;
  full_name: string;
  email: string;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatMetadataKey(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildDetailsPayload(log: AuditLogItem) {
  return {
    metadata: log.metadata ?? {},
    before_state: log.before_state,
    after_state: log.after_state,
  };
}

export function AuditLogsPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [entityTypeFilter, setEntityTypeFilter] = useState("");
  const [userIdFilter, setUserIdFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const {
    data: auditLogsData,
    error: auditLogsError,
    loading: auditLogsLoading,
    run: loadAuditLogs,
  } = useAsyncState<{
    data: AuditLogItem[];
    total: number;
    page: number;
    page_size: number;
    total_pages: number;
  }>();

  useEffect(() => {
    void usersService
      .list(1, 100)
      .then((response) => {
        setUserOptions(response.data.map((user) => ({
          id: user.id,
          full_name: user.full_name,
          email: user.email,
        })));
      })
      .catch(() => {
        setUserOptions([]);
      });
  }, []);

  useEffect(() => {
    void loadAuditLogs(async () => {
      try {
        return await auditLogsService.listAuditLogs({
          page,
          page_size: pageSize,
          action: actionFilter || undefined,
          entity_type: entityTypeFilter || undefined,
          user_id: userIdFilter || undefined,
          search: search || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
        });
      } catch {
        throw new Error("Não foi possível carregar os logs de auditoria.");
      }
    });
  }, [actionFilter, dateFrom, dateTo, entityTypeFilter, loadAuditLogs, page, pageSize, search, userIdFilter]);

  const logs = auditLogsData?.data ?? [];
  const total = auditLogsData?.total ?? 0;
  const totalPages = auditLogsData?.total_pages ?? 1;
  const hasFilters = Boolean(search || actionFilter || entityTypeFilter || userIdFilter || dateFrom || dateTo);

  function handleSearchSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  function clearFilters() {
    setSearchInput("");
    setSearch("");
    setActionFilter("");
    setEntityTypeFilter("");
    setUserIdFilter("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
    setPageSize(20);
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6 pb-12">
      <PageHeader
        title="Auditoria"
        subtitle="Consulte ações administrativas e alterações importantes realizadas no sistema."
      />

      <CrudPage<AuditLogItem>
        searchInput={searchInput}
        onSearchInputChange={setSearchInput}
        onSearchSubmit={handleSearchSubmit}
        onSearchClear={hasFilters ? clearFilters : undefined}
        searchPlaceholder="Buscar por ação, entidade, ID, usuário ou metadata..."
        filters={
          <>
            <input
              list="audit-entity-type-options"
              value={entityTypeFilter}
              onChange={(event) => {
                setEntityTypeFilter(event.target.value);
                setPage(1);
              }}
              placeholder="Tipo de entidade"
              className={inputCls}
            />
            <datalist id="audit-entity-type-options">
              {ENTITY_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>

            <input
              list="audit-action-options"
              value={actionFilter}
              onChange={(event) => {
                setActionFilter(event.target.value);
                setPage(1);
              }}
              placeholder="Ação"
              className={inputCls}
            />
            <datalist id="audit-action-options">
              {ACTION_OPTIONS.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>

            <select
              value={userIdFilter}
              onChange={(event) => {
                setUserIdFilter(event.target.value);
                setPage(1);
              }}
              className={filterSelectCls}
              aria-label="Filtrar por usuário"
            >
              <option value="">Todos os usuários</option>
              {userOptions.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.full_name} ({user.email})
                </option>
              ))}
            </select>

            <input
              type="date"
              value={dateFrom}
              onChange={(event) => {
                setDateFrom(event.target.value);
                setPage(1);
              }}
              className={filterSelectCls}
              aria-label="Data inicial"
            />

            <input
              type="date"
              value={dateTo}
              onChange={(event) => {
                setDateTo(event.target.value);
                setPage(1);
              }}
              className={filterSelectCls}
              aria-label="Data final"
            />
          </>
        }
        loading={auditLogsLoading}
        error={auditLogsError}
        count={total}
        isEmpty={!auditLogsLoading && !auditLogsError && logs.length === 0}
        emptyIcon="🧾"
        emptyTitle="Nenhum evento de auditoria encontrado."
        emptyDescription={
          hasFilters
            ? "Ajuste os filtros para ampliar a busca."
            : "Quando ações administrativas ocorrerem, os eventos aparecerão aqui."
        }
        emptyAction={hasFilters ? { label: "Limpar filtros", onClick: clearFilters } : undefined}
        columns={[
          { header: "Data/Hora", className: "w-44" },
          { header: "Ação", className: "w-48" },
          { header: "Entidade", className: "w-36" },
          { header: "Usuário", className: "w-64" },
          "Detalhes",
          { header: "ID da entidade", className: "w-44" },
          { header: "Ações", className: "w-28 text-right" },
        ]}
        items={logs}
        renderRow={(log) => (
          <tr
            key={log.id}
            className="border-b border-gray-100 align-top transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/40"
          >
            <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
              {formatDateTime(log.created_at)}
            </td>
            <td className="px-4 py-3">
              <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                {getAuditActionLabel(log.action)}
              </Badge>
            </td>
            <td className="px-4 py-3">
              <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                {getAuditEntityLabel(log.entity_type)}
              </Badge>
            </td>
            <td className="px-4 py-3">
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {getAuditUserLabel(log)}
              </div>
              {getAuditUserSecondaryLabel(log) ? (
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {getAuditUserSecondaryLabel(log)}
                </div>
              ) : null}
            </td>
            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
              {getAuditDetailSummary(log)}
            </td>
            <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">
              {log.entity_id ?? "—"}
            </td>
            <td className="px-4 py-3 text-right">
              <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedLog(log)}>
                Ver detalhes
              </Button>
            </td>
          </tr>
        )}
        footer={
          total > 0 ? (
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-gray-500">
                Página {page} de {totalPages} · {total} {total === 1 ? "evento" : "eventos"}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={String(pageSize)}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setPage(1);
                  }}
                  className={filterSelectCls}
                  aria-label="Itens por página"
                >
                  {PAGE_SIZE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option} por página
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page <= 1}
                >
                  Anterior
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page >= totalPages}
                >
                  Próxima
                </Button>
              </div>
            </div>
          ) : undefined
        }
      />

      {selectedLog ? (
        <Modal title="Detalhes do evento" onClose={() => setSelectedLog(null)} contentClassName="sm:max-w-3xl">
          <div className="overflow-y-auto px-6 py-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Resumo</CardTitle>
                  <CardDescription>Informações principais do evento auditado.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500">Ação</div>
                    <div className="font-medium">{getAuditActionLabel(selectedLog.action)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500">Tipo de entidade</div>
                    <div className="font-medium">{getAuditEntityLabel(selectedLog.entity_type)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500">ID da entidade</div>
                    <div className="font-mono text-xs">{selectedLog.entity_id ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500">Usuário</div>
                    <div className="font-medium">{getAuditUserLabel(selectedLog)}</div>
                    {getAuditUserSecondaryLabel(selectedLog) ? (
                      <div className="text-xs text-gray-500">{getAuditUserSecondaryLabel(selectedLog)}</div>
                    ) : null}
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500">Data/Hora</div>
                    <div className="font-medium">{formatDateTime(selectedLog.created_at)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500">Request ID</div>
                    <div className="font-mono text-xs">{selectedLog.request_id ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500">Correlation ID</div>
                    <div className="font-mono text-xs">{selectedLog.correlation_id ?? "—"}</div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Destaques</CardTitle>
                  <CardDescription>Campos conhecidos extraídos do metadata.</CardDescription>
                </CardHeader>
                <CardContent>
                  {getAuditHighlightedMetadata(selectedLog).length > 0 ? (
                    <div className="grid gap-3">
                      {getAuditHighlightedMetadata(selectedLog).map((entry) => (
                        <div key={entry.key}>
                          <div className="text-xs uppercase tracking-wide text-gray-500">
                            {formatMetadataKey(entry.key)}
                          </div>
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {entry.value}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">Nenhum campo destacado neste evento.</p>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="mt-4 grid gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Metadata</CardTitle>
                  <CardDescription>JSON formatado do metadata registrado no evento.</CardDescription>
                </CardHeader>
                <CardContent>
                  <pre className="max-h-80 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">
                    {JSON.stringify(selectedLog.metadata ?? {}, null, 2)}
                  </pre>
                </CardContent>
              </Card>

              {(selectedLog.before_state || selectedLog.after_state) ? (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Estados</CardTitle>
                    <CardDescription>Snapshot completo do evento para auditoria.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <pre className="max-h-96 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">
                      {JSON.stringify(buildDetailsPayload(selectedLog), null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
