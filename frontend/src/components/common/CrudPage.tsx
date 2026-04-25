import React from "react";
import { Search, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "./EmptyState";
import { SkeletonRows } from "./Skeleton";
import { DataTable, DataTableColumn } from "./DataTable";

type CrudPageProps<T> = {
  title?: string;
  subtitle?: string;
  newLabel?: string;
  onNew?: () => void;
  searchPlaceholder?: string;
  searchInput?: string;
  onSearchInputChange?: (val: string) => void;
  onSearchSubmit?: (e: React.FormEvent) => void;
  onSearchClear?: () => void;
  filters?: React.ReactNode;
  loading: boolean;
  error?: string | null;
  count?: number;
  isEmpty: boolean;
  emptyIcon?: string;
  emptyTitle: string;
  emptyDescription?: string;
  emptyAction?: { label: string; onClick: () => void };
  columns: Array<DataTableColumn | string>;
  items: T[];
  renderRow: (item: T) => React.ReactNode;
  footer?: React.ReactNode;
  children?: React.ReactNode;
};

export function CrudPage<T>({
  newLabel = "Novo",
  onNew,
  searchPlaceholder = "Buscar…",
  searchInput = "",
  onSearchInputChange,
  onSearchSubmit,
  onSearchClear,
  filters,
  loading,
  error,
  count,
  isEmpty,
  emptyIcon = "📋",
  emptyTitle,
  emptyDescription = "",
  emptyAction,
  title,
  subtitle,
  columns,
  items,
  renderRow,
  footer,
  children,
}: CrudPageProps<T>) {
  const hasToolbar = !!onSearchSubmit || !!filters || !!onNew;
  const normalizedColumns: DataTableColumn[] = columns.map((column) =>
    typeof column === "string" ? { header: column } : column
  );

  return (
    <div className="space-y-6">
      {title ? (
        <Card>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            {subtitle ? <CardDescription>{subtitle}</CardDescription> : null}
          </CardHeader>
        </Card>
      ) : null}

      {hasToolbar ? (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          {onSearchSubmit ? (
            <form className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center" onSubmit={onSearchSubmit}>
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  value={searchInput}
                  onChange={(e) => onSearchInputChange?.(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 pl-9 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <Button type="submit" size="sm">Buscar</Button>
              {onSearchClear ? (
                <Button type="button" variant="ghost" size="sm" onClick={onSearchClear}>
                  <X className="h-4 w-4 mr-1" /> Limpar
                </Button>
              ) : null}
            </form>
          ) : null}

          {filters ? <div className="flex flex-wrap items-center gap-2">{filters}</div> : null}

          {onNew ? (
            <Button type="button" onClick={onNew} className="ml-auto shrink-0">
              <Plus className="h-4 w-4 mr-1.5" /> {newLabel}
            </Button>
          ) : null}
        </div>
      ) : null}

      <Card>
        {count != null && !loading && !error && count > 0 ? (
          <div className="px-6 pt-4 pb-0">
            <p className="text-xs font-medium text-gray-500">
              {count} {count === 1 ? "resultado" : "resultados"}
            </p>
          </div>
        ) : null}

        <CardContent className="p-0">
          <DataTable
            columns={normalizedColumns}
            items={items}
            loading={loading}
            error={error}
            empty={
              !loading && !error && isEmpty
                ? {
                    icon: emptyIcon,
                    title: emptyTitle,
                    description: emptyDescription,
                    action: emptyAction,
                  }
                : undefined
            }
            renderRow={renderRow}
            footer={footer}
          />
        </CardContent>
      </Card>

      {children}
    </div>
  );
}
