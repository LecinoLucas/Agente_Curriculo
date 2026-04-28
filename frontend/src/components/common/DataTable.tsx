import React from "react";
import { EmptyState } from "./EmptyState";
import { SkeletonRows } from "./Skeleton";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type DataTableColumn = {
  header: React.ReactNode;
  className?: string;
};

type DataTableProps<T> = {
  columns: DataTableColumn[];
  items: T[];
  loading?: boolean;
  error?: string | null;
  empty?: {
    icon?: string;
    title: string;
    description?: string;
    action?: { label: string; onClick: () => void };
  };
  renderRow: (item: T) => React.ReactNode;
  rowKey?: (item: T) => React.Key;
  footer?: React.ReactNode;
  skeletonRows?: number;
};

export function DataTable<T>({
  columns,
  items,
  loading,
  error,
  empty,
  renderRow,
  rowKey,
  footer,
  skeletonRows = 6,
}: DataTableProps<T>) {
  return (
    <div className="ui-card overflow-hidden rounded-xl">
      {loading ? <SkeletonRows rows={skeletonRows} /> : null}

      {error ? (
        <div className="flex items-center gap-2 px-4 py-6 text-sm text-[hsl(var(--danger))]">
          <span className="font-semibold">!</span>
          <span>{error}</span>
        </div>
      ) : null}

      {!loading && !error && items.length === 0 && empty ? (
        <EmptyState
          icon={empty.icon}
          title={empty.title}
          description={empty.description}
          action={empty.action}
        />
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="ui-surface-muted">
                <TableRow className="hover:bg-[hsl(var(--surface-muted))]">
                  {columns.map((col, index) => (
                    <TableHead key={index} className={cn("ui-text-muted", col.className)}>
                      {col.header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => (
                  <React.Fragment key={rowKey ? rowKey(item) : index}>
                    {renderRow(item)}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
          {footer ? <div className="ui-surface-muted border-t px-4 py-3">{footer}</div> : null}
        </>
      ) : null}
    </div>
  );
}
