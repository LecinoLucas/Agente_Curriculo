import { ClipboardList, Loader } from "lucide-react";
import { useEffect, useState } from "react";

import {
  approvePreAdmissionDocument,
  createPreAdmission,
  createPreAdmissionChecklistItem,
  downloadPreAdmissionDocument,
  getPreAdmission,
  getPreAdmissionEvents,
  listPreAdmissionDocuments,
  rejectPreAdmissionDocument,
  updatePreAdmission,
  updatePreAdmissionChecklistItem,
} from "../../../../services/preAdmissionService";
import type {
  PreAdmissionCase,
  PreAdmissionChecklistItemStatus,
  PreAdmissionChecklistItemType,
  PreAdmissionDocument,
  PreAdmissionEvent,
  PreAdmissionStatus,
} from "../../../../types/domain";
import { AdmissionPackagePanel } from "./AdmissionPackagePanel";
import { PreAdmissionChecklist } from "./PreAdmissionChecklist";
import { PreAdmissionEventTimeline } from "./PreAdmissionEventTimeline";
import { PreAdmissionStatusCard } from "./PreAdmissionStatusCard";

interface CandidatePreAdmissionPanelProps {
  jobId: string | null;
  candidateId: string | null;
}

export function CandidatePreAdmissionPanel({ jobId, candidateId }: CandidatePreAdmissionPanelProps) {
  const [preAdmissionCase, setPreAdmissionCase] = useState<PreAdmissionCase | null>(null);
  const [events, setEvents] = useState<PreAdmissionEvent[]>([]);
  const [documents, setDocuments] = useState<PreAdmissionDocument[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [salaryOffer, setSalaryOffer] = useState("");
  const [startDate, setStartDate] = useState("");
  const [workModel, setWorkModel] = useState("");
  const [notes, setNotes] = useState("");

  const loadEvents = async (caseId: string) => {
    const [eventsPayload, documentsPayload] = await Promise.all([
      getPreAdmissionEvents(caseId),
      listPreAdmissionDocuments(caseId),
    ]);
    setEvents(eventsPayload.events);
    setDocuments(documentsPayload.documents);
  };

  const load = async () => {
    if (!jobId || !candidateId) {
      setPreAdmissionCase(null);
      setCanCreate(false);
      setEvents([]);
      setDocuments([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload = await getPreAdmission(jobId, candidateId);
      setPreAdmissionCase(payload.case);
      setCanCreate(payload.can_create);
      if (payload.case) {
        await loadEvents(payload.case.id);
      } else {
        setEvents([]);
        setDocuments([]);
      }
    } catch {
      setError("Não foi possível carregar a pré-admissão.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [candidateId, jobId]);

  const handleCreate = async () => {
    if (!jobId || !candidateId) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createPreAdmission(jobId, candidateId, {
        salary_offer: salaryOffer.trim() || null,
        start_date: startDate || null,
        work_model: workModel.trim() || null,
        notes: notes.trim() || null,
      });
      setPreAdmissionCase(created);
      setCanCreate(false);
      await loadEvents(created.id);
    } catch {
      setError("Não foi possível criar a pré-admissão.");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (status: PreAdmissionStatus) => {
    if (!preAdmissionCase || status === preAdmissionCase.status) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updatePreAdmission(preAdmissionCase.id, { status });
      setPreAdmissionCase(updated);
      await loadEvents(updated.id);
    } catch {
      setError("Não foi possível atualizar o status.");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateItem = async (payload: {
    item_type: PreAdmissionChecklistItemType;
    title: string;
    required: boolean;
  }) => {
    if (!preAdmissionCase) return;
    setSaving(true);
    setError(null);
    try {
      const item = await createPreAdmissionChecklistItem(preAdmissionCase.id, payload);
      setPreAdmissionCase((current) =>
        current ? { ...current, checklist_items: [...current.checklist_items, item] } : current,
      );
      await loadEvents(preAdmissionCase.id);
    } catch {
      setError("Não foi possível criar o item de checklist.");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateItem = async (itemId: string, status: PreAdmissionChecklistItemStatus) => {
    if (!preAdmissionCase) return;
    setSaving(true);
    setError(null);
    try {
      const item = await updatePreAdmissionChecklistItem(preAdmissionCase.id, itemId, { status });
      setPreAdmissionCase((current) =>
        current
          ? {
              ...current,
              checklist_items: current.checklist_items.map((existing) =>
                existing.id === item.id ? item : existing,
              ),
            }
          : current,
      );
      await loadEvents(preAdmissionCase.id);
    } catch {
      setError("Não foi possível atualizar o item de checklist.");
    } finally {
      setSaving(false);
    }
  };

  const handleApproveDocument = async (documentId: string) => {
    if (!preAdmissionCase) return;
    setSaving(true);
    setError(null);
    try {
      const document = await approvePreAdmissionDocument(documentId);
      setDocuments((current) => current.map((item) => (item.id === document.id ? document : item)));
      await load();
    } catch {
      setError("Não foi possível aprovar o documento.");
    } finally {
      setSaving(false);
    }
  };

  const handleRejectDocument = async (documentId: string, reviewNotes: string) => {
    if (!preAdmissionCase) return;
    setSaving(true);
    setError(null);
    try {
      const document = await rejectPreAdmissionDocument(documentId, reviewNotes);
      setDocuments((current) => current.map((item) => (item.id === document.id ? document : item)));
      await load();
    } catch {
      setError("Não foi possível rejeitar o documento.");
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadDocument = async (documentId: string, filename: string) => {
    setError(null);
    try {
      const blob = await downloadPreAdmissionDocument(documentId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Não foi possível baixar o documento.");
    }
  };

  if (loading) {
    return (
      <div role="status" className="flex items-center justify-center p-8">
        <Loader className="h-5 w-5 animate-spin text-[hsl(var(--text-muted))]" />
      </div>
    );
  }

  if (!jobId || !candidateId) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/30 p-5 text-sm text-[hsl(var(--text-muted))]">
          Vincule o candidato a uma vaga ativa para acompanhar pré-admissão.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-[hsl(var(--accent-soft))] p-2 text-[hsl(var(--primary))]">
          <ClipboardList className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
            Pós-decisão
          </p>
          <h3 className="text-base font-semibold text-[hsl(var(--text))]">
            Pré-admissão manual
          </h3>
          <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">
            Fluxo auditável para oferta, pendências e preparação documental. Não integra ERP nesta fase.
          </p>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
        </div>
      ) : null}

      {!preAdmissionCase && !canCreate ? (
        <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/30 p-5 text-sm text-[hsl(var(--text-muted))]">
          Pré-admissão disponível apenas após decisão de contratação.
        </div>
      ) : null}

      {!preAdmissionCase && canCreate ? (
        <div className="space-y-4 rounded-lg border border-[hsl(var(--border))] bg-white p-4">
          <div>
            <h4 className="text-sm font-semibold text-[hsl(var(--text))]">Criar pré-admissão</h4>
            <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">
              Registre a oferta inicial e acompanhe as pendências manualmente.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
                Oferta salarial
              </span>
              <input
                value={salaryOffer}
                onChange={(event) => setSalaryOffer(event.target.value)}
                placeholder="12000.00"
                className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
                Data prevista
              </span>
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
                Modelo de trabalho
              </span>
              <input
                value={workModel}
                onChange={(event) => setWorkModel(event.target.value)}
                placeholder="Híbrido"
                className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="block space-y-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
              Observações
            </span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              className="w-full resize-none rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={saving}
            className="rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {saving ? "Criando..." : "Criar pré-admissão"}
          </button>
        </div>
      ) : null}

      {preAdmissionCase ? (
        <>
          <PreAdmissionStatusCard
            preAdmissionCase={preAdmissionCase}
            updating={saving}
            onStatusChange={handleStatusChange}
          />
          <PreAdmissionChecklist
            items={preAdmissionCase.checklist_items}
            documents={documents}
            updating={saving}
            onCreateItem={handleCreateItem}
            onUpdateItem={handleUpdateItem}
            onApproveDocument={handleApproveDocument}
            onRejectDocument={handleRejectDocument}
            onDownloadDocument={handleDownloadDocument}
          />
          <PreAdmissionEventTimeline events={events} />
          <AdmissionPackagePanel
            caseId={preAdmissionCase.id}
            caseStatus={preAdmissionCase.status}
          />
        </>
      ) : null}
    </div>
  );
}
