import React from "react";

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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div className="pagination-summary">Mostrando {total ?? 0} item(s)</div>
        {onPageSizeChange ? (
          <label>
            Por página
            <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))} style={{ marginLeft: 8 }}>
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
      <button key="page-1" className="btn" type="button" onClick={() => onPageChange(1)}>
        1
      </button>,
    );
    pageButtons.push(
      <span key="left-ellipsis" style={{ padding: "0 6px" }}>
        ...
      </span>,
    );
  }

  for (let p = start; p <= end; p++) {
    pageButtons.push(
      <button
        key={p}
        className="btn"
        type="button"
        onClick={() => onPageChange(p)}
        disabled={p === page}
        style={{ fontWeight: p === page ? 700 : 400 }}
      >
        {p}
      </button>,
    );
  }

  if (end < totalPages) {
    pageButtons.push(
      <span key="right-ellipsis" style={{ padding: "0 6px" }}>
        ...
      </span>,
    );
    pageButtons.push(
      <button key={`page-${totalPages}`} className="btn" type="button" onClick={() => onPageChange(totalPages)}>
        {totalPages}
      </button>,
    );
  }

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button className="btn" type="button" onClick={() => onPageChange(1)} disabled={page <= 1}>
          « Primeiro
        </button>
        <button className="btn" type="button" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1}>
          Anterior
        </button>
        <div style={{ display: "flex", gap: 6, alignItems: "center", margin: "0 8px" }}>{pageButtons}</div>
        <button className="btn" type="button" onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages}>
          Próxima
        </button>
        <button className="btn" type="button" onClick={() => onPageChange(totalPages)} disabled={page >= totalPages} style={{ marginLeft: 8 }}>
          Último »
        </button>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <div className="pagination-summary">Página {page} de {totalPages}</div>
        {onPageSizeChange ? (
          <label>
            Por página
            <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))} style={{ marginLeft: 8 }}>
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
