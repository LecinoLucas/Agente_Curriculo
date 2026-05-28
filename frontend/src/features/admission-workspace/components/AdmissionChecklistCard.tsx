import {
  Ban,
  Eye,
  FileText,
  MoreHorizontal,
} from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import type { AdmissionWorkspaceChecklistItem } from "../../../types/domain";
import {
  checklistItemStatusLabel,
  formatDateTime,
  progressPercent,
  statusBadgeVariant,
} from "../utils";

type AdmissionChecklistCardProps = {
  items: AdmissionWorkspaceChecklistItem[];
  loadingActionKey: string | null;
  onMarkNotRequired: (itemId: string) => void;
  onReviewDocument: (documentId: string) => void;
};

function ChecklistStatusDot({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    approved: "bg-[hsl(var(--success))]",
    received: "bg-[hsl(var(--success))]",
    rejected: "bg-[hsl(var(--danger))]",
    not_required: "bg-[hsl(var(--text-muted))]",
    pending: "bg-[hsl(var(--warning))]",
  };
  const color = colorMap[status] ?? "bg-[hsl(var(--warning))]";
  return (
    <span className={`mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full ${color}`} aria-hidden="true" />
  );
}

function ChecklistItemActions({
  item,
  loadingActionKey,
  onMarkNotRequired,
  onReviewDocument,
  open,
  onToggle,
}: {
  item: AdmissionWorkspaceChecklistItem;
  loadingActionKey: string | null;
  onMarkNotRequired: (itemId: string) => void;
  onReviewDocument: (documentId: string) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const documentId = item.document_id;

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={onToggle}
        aria-label="Ações do item"
        aria-expanded={open}
        className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open ? (
        <div className="absolute right-0 top-8 z-20 min-w-[180px] rounded-xl border border-border bg-surface p-1 shadow-lg">
          <button
            type="button"
            disabled={!documentId}
            onClick={() => {
              onToggle();
              if (documentId) onReviewDocument(documentId);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-text transition-colors hover:bg-success-soft hover:text-success disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Eye className="h-3.5 w-3.5" />
            Revisar documento
          </button>
          <div className="my-1 border-t border-border/60" />
          <button
            type="button"
            disabled={loadingActionKey === `${item.id}:mark-not-required`}
            onClick={() => {
              onToggle();
              onMarkNotRequired(item.id);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-text-muted transition-colors hover:bg-surface-muted disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Ban className="h-3.5 w-3.5" />
            Não obrigatório
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function AdmissionChecklistCard({
  items,
  loadingActionKey,
  onMarkNotRequired,
  onReviewDocument,
}: AdmissionChecklistCardProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const approved = items.filter((i) => i.status === "approved" || i.status === "not_required").length;
  const total = items.length;
  const progress = progressPercent(approved, total);

  return (
    <section id="admission-checklist-section" className="admission-section-card">
      {/* Card header */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="text-base font-semibold text-text">
            Checklist admissional
          </h2>
          <span className="text-sm font-medium text-text-muted">
            {approved} de {total} documentos aprovados
          </span>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[hsl(var(--border))]/50">
          <div
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${approved} de ${total} documentos aprovados`}
            className="h-full rounded-full bg-[hsl(var(--brand-dark))] transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Item list */}
      <div className="divide-y divide-[hsl(var(--border))]/50">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-muted/40"
          >
            {/* Position badge */}
            <span
              aria-hidden="true"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--accent-soft))] text-[10px] font-bold text-[hsl(var(--brand-dark))]"
            >
              {item.position}
            </span>

            {/* Document icon */}
            <FileText
              className="h-4 w-4 shrink-0 text-text-muted"
              aria-hidden="true"
            />

            {/* Title */}
            <p className="min-w-0 flex-1 truncate text-sm font-medium text-text">
              {item.title}
            </p>

            {/* Status badge */}
            <Badge variant={statusBadgeVariant(item.status)} className="shrink-0">
              {checklistItemStatusLabel(item.status)}
            </Badge>

            {/* Date / observation */}
            <span className="hidden shrink-0 text-xs text-text-muted sm:block">
              {item.updated_by_name
                ? `${formatDateTime(item.updated_at)}`
                : item.document_id
                  ? formatDateTime(item.updated_at)
                  : "—"}
            </span>

            {/* Status dot */}
            <ChecklistStatusDot status={item.status} />

            {/* Actions menu */}
            <ChecklistItemActions
              item={item}
              loadingActionKey={loadingActionKey}
              onMarkNotRequired={onMarkNotRequired}
              onReviewDocument={onReviewDocument}
              open={openMenuId === item.id}
              onToggle={() => setOpenMenuId(openMenuId === item.id ? null : item.id)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
