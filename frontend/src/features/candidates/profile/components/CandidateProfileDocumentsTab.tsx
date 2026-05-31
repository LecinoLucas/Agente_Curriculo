import { type ChangeEvent, useEffect, useMemo, useState } from "react";

import { useAuth } from "../../../auth/useAuth";
import { formatDateTime } from "../profileFormatters";
import { ActionButton, DefinitionList, EmptyBlock, SectionCard } from "./ProfileSharedUI";
import { formatContextError } from "../../../../services/errorMessages";
import { resumeService } from "../../../../services/resumeService";
import { toast } from "../../../../shared/utils/toast";
import type { CandidateOverview, Resume, ResumeVersion } from "../../../../types/domain";

interface CandidateProfileDocumentsTabProps {
  overview: CandidateOverview;
  onReload: () => Promise<void>;
}

export function CandidateProfileDocumentsTab({
  overview,
  onReload,
}: CandidateProfileDocumentsTabProps) {
  const { user } = useAuth();
  const resumes = overview.resumes ?? [];
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [resumesById, setResumesById] = useState<Record<string, Resume>>({});
  const [resumesLoading, setResumesLoading] = useState(false);
  const [resumesError, setResumesError] = useState<string | null>(null);
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null);
  const [previewFileName, setPreviewFileName] = useState<string | null>(null);
  const [previewContentType, setPreviewContentType] = useState<string | null>(null);
  const canDownload = user?.role === "admin" || user?.role === "recruiter";
  const currentResumeSummary = useMemo(() => {
    if (resumes.length === 0) return null;
    return resumes.find((resume) => resume.status === "active") ?? resumes[0];
  }, [resumes]);
  const selectedResumeSummary = useMemo(() => {
    if (!selectedResumeId) return currentResumeSummary;
    return resumes.find((resume) => resume.resume_id === selectedResumeId) ?? currentResumeSummary;
  }, [currentResumeSummary, resumes, selectedResumeId]);
  const selectedResumeDetails = selectedResumeSummary
    ? resumesById[selectedResumeSummary.resume_id] ?? null
    : null;
  const selectedVersion = useMemo<ResumeVersion | null>(() => {
    if (!selectedResumeDetails) return null;
    if (selectedVersionId) {
      return selectedResumeDetails.versions.find((version) => version.id === selectedVersionId) ?? null;
    }
    const fallbackVersionId = selectedResumeSummary?.current_version_id;
    if (fallbackVersionId) {
      return selectedResumeDetails.versions.find((version) => version.id === fallbackVersionId) ?? null;
    }
    return selectedResumeDetails.versions[0] ?? null;
  }, [selectedResumeDetails, selectedResumeSummary, selectedVersionId]);

  useEffect(() => {
    setSelectedResumeId(currentResumeSummary?.resume_id ?? null);
  }, [currentResumeSummary?.resume_id]);

  useEffect(() => {
    setSelectedVersionId(selectedResumeSummary?.current_version_id ?? null);
  }, [selectedResumeSummary?.resume_id, selectedResumeSummary?.current_version_id]);

  useEffect(() => {
    let cancelled = false;
    if (resumes.length === 0) {
      setResumesById({});
      setResumesError(null);
      return () => {
        cancelled = true;
      };
    }

    setResumesLoading(true);
    setResumesError(null);
    void Promise.all(resumes.map((resume) => resumeService.get(resume.resume_id)))
      .then((items) => {
        if (cancelled) return;
        const next: Record<string, Resume> = {};
        for (const item of items) next[item.id] = item;
        setResumesById(next);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setResumesError(
          formatContextError(
            err,
            "Não foi possível carregar metadados do currículo.",
            "Tente novamente em instantes.",
          ),
        );
      })
      .finally(() => {
        if (!cancelled) setResumesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [resumes]);

  useEffect(() => {
    return () => {
      if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    };
  }, [previewObjectUrl]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const created = await resumeService.initiateUpload(overview.candidate.id);
      await resumeService.uploadPdf(created.resume_id, file);
      setFile(null);
      toast.success("Currículo enviado.");
      await onReload();
    } catch (err: unknown) {
      toast.error(
        formatContextError(
          err,
          "Não foi possível enviar o currículo.",
          "Verifique o PDF e tente novamente.",
        ),
      );
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async () => {
    if (!selectedResumeSummary) return;
    setDownloading(true);
    try {
      await resumeService.downloadCandidateResume(
        overview.candidate.id,
        selectedResumeSummary.resume_id,
        { versionId: selectedVersion?.id ?? selectedResumeSummary.current_version_id },
      );
    } catch (err: unknown) {
      toast.error(
        formatContextError(
          err,
          "Não foi possível baixar o currículo.",
          "Confirme se há um arquivo enviado para este candidato.",
        ),
      );
    } finally {
      setDownloading(false);
    }
  };

  const canPreviewInline = (mimeType: string | null): boolean => {
    if (!mimeType) return false;
    if (mimeType === "application/pdf") return true;
    return mimeType.startsWith("image/");
  };

  const isDocFormat = (mimeType: string | null, fileName: string | null): boolean => {
    const lowerName = (fileName ?? "").toLowerCase();
    if (lowerName.endsWith(".doc") || lowerName.endsWith(".docx")) return true;
    return (
      mimeType === "application/msword" ||
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
  };

  const handlePreview = async () => {
    if (!selectedResumeSummary) return;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const payload = await resumeService.fetchCandidateResumeFile(
        overview.candidate.id,
        selectedResumeSummary.resume_id,
        {
          versionId: selectedVersion?.id ?? selectedResumeSummary.current_version_id,
          disposition: "inline",
        },
      );
      if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
      const objectUrl = URL.createObjectURL(payload.blob);
      setPreviewObjectUrl(objectUrl);
      setPreviewFileName(payload.filename);
      setPreviewContentType(payload.contentType);
    } catch (err: unknown) {
      setPreviewError(
        formatContextError(
          err,
          "Não foi possível carregar o currículo.",
          "Tente novamente ou faça o download do arquivo.",
        ),
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleOpenInNewTab = async () => {
    if (!selectedResumeSummary) return;
    try {
      const payload = await resumeService.fetchCandidateResumeFile(
        overview.candidate.id,
        selectedResumeSummary.resume_id,
        {
          versionId: selectedVersion?.id ?? selectedResumeSummary.current_version_id,
          disposition: "inline",
        },
      );
      const objectUrl = URL.createObjectURL(payload.blob);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (err: unknown) {
      toast.error(
        formatContextError(
          err,
          "Não foi possível abrir o currículo em nova aba.",
          "Tente novamente.",
        ),
      );
    }
  };

  const selectedFileName =
    selectedVersion?.original_file_name ?? selectedResumeSummary?.current_file_name ?? null;
  const selectedMimeType = selectedVersion?.mime_type ?? previewContentType ?? null;
  const showInlinePreview = canPreviewInline(selectedMimeType);
  const showDocFallback = isDocFormat(selectedMimeType, selectedFileName);

  return (
    <div className="space-y-4">
      <SectionCard title="Enviar currículo">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={handleFileChange}
            className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm"
          />
          <ActionButton onClick={() => void handleUpload()} disabled={!file || uploading} primary>
            {uploading ? "Enviando..." : "Enviar currículo"}
          </ActionButton>
          {canDownload && selectedResumeSummary?.current_version_id ? (
            <ActionButton onClick={() => void handleDownload()} disabled={downloading}>
              {downloading ? "Baixando..." : "Baixar currículo"}
            </ActionButton>
          ) : null}
        </div>
        {file ? (
          <p className="mt-2 text-xs text-text-muted">
            Selecionado: {file.name}
          </p>
        ) : null}
      </SectionCard>

      {resumes.length === 0 ? (
        <EmptyBlock
          title="Nenhum currículo enviado"
          description="Quando um currículo for enviado pelo candidato ou pelo recrutador, ele aparecerá aqui."
        />
      ) : (
        <>
          <SectionCard title="Currículo atual">
            {selectedResumeSummary ? (
              <div className="space-y-4">
                <DefinitionList
                  items={[
                    ["Arquivo", selectedFileName ?? "Sem arquivo"],
                    ["Tipo", selectedMimeType ?? "Não informado"],
                    [
                      "Data de envio",
                      selectedVersion
                        ? formatDateTime(selectedVersion.uploaded_at)
                        : formatDateTime(selectedResumeSummary.updated_at),
                    ],
                    [
                      "Status de extração",
                      selectedVersion?.extraction_status ??
                        selectedResumeSummary.extraction_status ??
                        "-",
                    ],
                    ["Versão atual", `v${selectedResumeSummary.current_version}`],
                  ]}
                />
                <div className="flex flex-wrap gap-2">
                  <ActionButton onClick={() => void handlePreview()} disabled={previewLoading}>
                    {previewLoading ? "Carregando..." : "Visualizar currículo"}
                  </ActionButton>
                  {canDownload ? (
                    <ActionButton onClick={() => void handleDownload()} disabled={downloading}>
                      {downloading ? "Baixando..." : "Baixar"}
                    </ActionButton>
                  ) : null}
                  <ActionButton onClick={() => void handleOpenInNewTab()}>
                    Abrir em nova aba
                  </ActionButton>
                </div>
              </div>
            ) : (
              <p className="text-sm text-text-muted">Nenhum currículo enviado.</p>
            )}
          </SectionCard>

          <SectionCard title="Visualização do currículo">
            {previewLoading ? (
              <div className="space-y-2">
                <div className="h-4 w-56 animate-pulse rounded bg-surface-muted" />
                <div className="h-72 animate-pulse rounded-xl border border-[hsl(var(--border)/0.7)] bg-surface-muted" />
              </div>
            ) : null}
            {!previewLoading && previewError ? (
              <p className="text-sm text-danger">Não foi possível carregar o currículo.</p>
            ) : null}
            {!previewLoading && !previewError && !previewObjectUrl ? (
              <p className="text-sm text-text-muted">
                Clique em "Visualizar currículo" para abrir o arquivo.
              </p>
            ) : null}
            {!previewLoading && !previewError && previewObjectUrl && showInlinePreview ? (
              selectedMimeType?.startsWith("image/") ? (
                <img
                  src={previewObjectUrl}
                  alt={previewFileName ?? "Preview do currículo"}
                  className="max-h-[70vh] w-full rounded-xl border border-[hsl(var(--border)/0.7)] object-contain"
                />
              ) : (
                <iframe
                  title={previewFileName ?? "Preview do currículo"}
                  src={previewObjectUrl}
                  className="h-[70vh] w-full rounded-xl border border-[hsl(var(--border)/0.7)]"
                />
              )
            ) : null}
            {!previewLoading && !previewError && previewObjectUrl && !showInlinePreview && showDocFallback ? (
              <p className="text-sm text-text-muted">
                Pré-visualização indisponível para este formato. Baixe o arquivo para visualizar.
              </p>
            ) : null}
            {!previewLoading &&
            !previewError &&
            previewObjectUrl &&
            !showInlinePreview &&
            !showDocFallback ? (
              <p className="text-sm text-text-muted">
                Não foi possível renderizar este tipo de arquivo no navegador. Use "Baixar" ou "Abrir
                em nova aba".
              </p>
            ) : null}
          </SectionCard>

          <SectionCard title="Versões do currículo">
            {resumesLoading ? (
              <div className="h-16 animate-pulse rounded-xl border border-[hsl(var(--border)/0.7)] bg-surface-muted" />
            ) : null}
            {!resumesLoading && resumesError ? (
              <p className="text-sm text-danger">{resumesError}</p>
            ) : null}
            {!resumesLoading && !resumesError && selectedResumeDetails?.versions.length ? (
              <ul className="space-y-2">
                {selectedResumeDetails.versions.map((version) => (
                  <li
                    key={version.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--bg))] px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-semibold text-text">
                        v{version.version_number} · {version.original_file_name}
                      </p>
                      <p className="text-xs text-text-muted">
                        {formatDateTime(version.uploaded_at)} · {version.mime_type}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedVersionId(version.id)}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text hover:bg-surface-muted"
                    >
                      {selectedVersion?.id === version.id ? "Selecionada" : "Visualizar"}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </SectionCard>
        </>
      )}
    </div>
  );
}
