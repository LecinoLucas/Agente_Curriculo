import {
  Ban,
  CheckCircle2,
  FileWarning,
  MessageSquareWarning,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { AdmissionWorkspaceChecklistItem } from "../../../types/domain";
import { AdmissionSectionCard } from "./AdmissionSectionCard";
import {
  checklistItemStatusLabel,
  formatDateTime,
  statusBadgeVariant,
} from "../utils";

type ChecklistAction = "approve" | "reject" | "request-correction" | "mark-not-required";

type AdmissionChecklistCardProps = {
  items: AdmissionWorkspaceChecklistItem[];
  loadingActionKey: string | null;
  onAction: (itemId: string, action: ChecklistAction) => void;
};

export function AdmissionChecklistCard({
  items,
  loadingActionKey,
  onAction,
}: AdmissionChecklistCardProps) {
  return (
    <AdmissionSectionCard
      eyebrow="Checklist"
      title="Checklist admissional"
      description="Aprovação operacional item a item, sem depender de montagem manual do frontend."
      id="admission-checklist-section"
    >
      <div className="space-y-3">
        {items.map((item) => {
          const hasDocument = Boolean(item.document_id);
          const isFinished = item.status === "approved" || item.status === "not_required";

          return (
            <article
              key={item.id}
              className="admission-row p-4"
            >
              <div className="flex flex-col gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[hsl(var(--accent-soft))] text-xs font-semibold text-[hsl(var(--brand-dark))]">
                      {item.position}
                    </span>
                    <p className="text-sm font-semibold text-[hsl(var(--text))]">
                      {item.title}
                    </p>
                    <Badge variant={statusBadgeVariant(item.status)}>
                      {checklistItemStatusLabel(item.status)}
                    </Badge>
                    <Badge variant={item.required ? "outline" : "neutral"}>
                      {item.required ? "Obrigatório" : "Opcional"}
                    </Badge>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[hsl(var(--text-muted))]">
                    <span>
                      Documento: {hasDocument ? "vinculado" : "aguardando envio"}
                    </span>
                    <span>Atualizado em {formatDateTime(item.updated_at)}</span>
                    {item.updated_by_name ? (
                      <span>Por {item.updated_by_name}</span>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!hasDocument || isFinished || loadingActionKey === `${item.id}:approve`}
                    onClick={() => onAction(item.id, "approve")}
                    className="ui-btn-primary inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-semibold disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Aprovar
                  </button>
                  <button
                    type="button"
                    disabled={!hasDocument || loadingActionKey === `${item.id}:reject`}
                    onClick={() => onAction(item.id, "reject")}
                    className="ui-btn-secondary inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-semibold disabled:opacity-50"
                  >
                    <FileWarning className="h-4 w-4" />
                    Rejeitar
                  </button>
                  <button
                    type="button"
                    disabled={!hasDocument || loadingActionKey === `${item.id}:request-correction`}
                    onClick={() => onAction(item.id, "request-correction")}
                    className="ui-btn-secondary inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-semibold disabled:opacity-50"
                  >
                    <MessageSquareWarning className="h-4 w-4" />
                    Solicitar correção
                  </button>
                  <button
                    type="button"
                    disabled={loadingActionKey === `${item.id}:mark-not-required`}
                    onClick={() => onAction(item.id, "mark-not-required")}
                    className="ui-btn-secondary inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-semibold disabled:opacity-50"
                  >
                    <Ban className="h-4 w-4" />
                    Não obrigatório
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </AdmissionSectionCard>
  );
}
