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
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      {loading ? <SkeletonRows rows={skeletonRows} /> : null}

      {error ? (
        <div className="flex items-center gap-2 px-4 py-6 text-sm text-red-600">
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
              <TableHeader className="bg-gray-50">
                <TableRow className="hover:bg-gray-50">
                  {columns.map((col, index) => (
                    <TableHead key={index} className={cn("text-gray-500", col.className)}>
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
          {footer ? <div className="border-t border-gray-200 bg-gray-50 px-4 py-3">{footer}</div> : null}
        </>
      ) : null}
    </div>
  );
}
