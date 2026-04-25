import React from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

import { Button } from "@/components/ui/button";

type PaginationProps = {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
  pageSize?: number;
  onPageSizeChange?: (s: number) => void;
  total?: number;
  maxButtons?: number;
};

export default function Pagination({
  page,
  totalPages,
  onPageChange,
  pageSize,
  onPageSizeChange,
  total,
  maxButtons = 5,
}: PaginationProps) {
  if (totalPages <= 1) {
    return (
      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <div>Mostrando {total ?? 0} item(s)</div>
        {onPageSizeChange ? (
          <label className="flex items-center gap-2">
            Por página
            <select
              className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
            </select>
          </label>
        ) : null}
      </div>
    );
  }

  const half = Math.floor(maxButtons / 2);
  let start = Math.max(1, page - half);
  let end = Math.min(totalPages, start + maxButtons - 1);
  if (end - start + 1 < maxButtons) {
    start = Math.max(1, end - maxButtons + 1);
  }

  const pageButtons = [] as React.ReactNode[];
  if (start > 1) {
    pageButtons.push(
      <Button key="page-1" variant="outline" size="sm" type="button" onClick={() => onPageChange(1)}>
        1
      </Button>,
    );
    pageButtons.push(
      <span key="left-ellipsis" className="px-2 text-gray-400">
        ...
      </span>,
    );
  }

  for (let p = start; p <= end; p++) {
    pageButtons.push(
      <Button
        key={p}
        variant={p === page ? "default" : "outline"}
        size="sm"
        type="button"
        onClick={() => onPageChange(p)}
        disabled={p === page}
      >
        {p}
      </Button>,
    );
  }

  if (end < totalPages) {
    pageButtons.push(
      <span key="right-ellipsis" className="px-2 text-gray-400">
        ...
      </span>,
    );
    pageButtons.push(
      <Button key={`page-${totalPages}`} variant="outline" size="sm" type="button" onClick={() => onPageChange(totalPages)}>
        {totalPages}
      </Button>,
    );
  }

  return (
    <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" type="button" onClick={() => onPageChange(1)} disabled={page <= 1}>
          <ChevronsLeft className="mr-1 h-4 w-4" /> Primeiro
        </Button>
        <Button variant="outline" size="sm" type="button" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Anterior
        </Button>
        <div className="flex items-center gap-1">{pageButtons}</div>
        <Button variant="outline" size="sm" type="button" onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages}>
          Próxima <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" type="button" onClick={() => onPageChange(totalPages)} disabled={page >= totalPages}>
          Último <ChevronsRight className="ml-1 h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="text-sm text-muted-foreground">Página {page} de {totalPages}</div>
        {onPageSizeChange ? (
          <label className="flex items-center gap-2 text-sm">
            Por página
            <select
              className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
            </select>
          </label>
        ) : null}
      </div>
    </div>
  );
}
