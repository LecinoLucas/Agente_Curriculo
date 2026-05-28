import { useEffect, useState } from "react";
import { LoaderCircle, Pencil, Trash2 } from "lucide-react";

import { candidatesService } from "../../../../services/candidatesService";
import { HttpError } from "../../../../services/http";
import type { CandidateNote } from "../../../../types/domain";

const MAX_NOTE_LENGTH = 2000;

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

interface CandidateNotesTabProps {
  candidateId: string | null;
}

export function CandidateNotesTab({ candidateId }: CandidateNotesTabProps) {
  const [notes, setNotes] = useState<CandidateNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);

  const isSaveDisabled = submitting || !text.trim() || text.trim().length > MAX_NOTE_LENGTH;

  const loadNotes = async () => {
    if (!candidateId) return;
    try {
      setLoading(true);
      setError(null);
      const response = await candidatesService.listNotes(candidateId);
      setNotes(Array.isArray(response) ? response : []);
    } catch {
      setError("Não foi possível carregar as observações internas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadNotes();
  }, [candidateId]);

  const handleCreate = async () => {
    if (!candidateId || isSaveDisabled) return;
    try {
      setSubmitting(true);
      setError(null);
      const created = await candidatesService.createNote(candidateId, {
        note_text: text.trim(),
      });
      setNotes((prev) => [created, ...prev]);
      setText("");
    } catch (error) {
      if (error instanceof HttpError && error.status === 422) {
        setError(
          typeof error.detail === "string"
            ? error.detail
            : "A observação é obrigatória e deve ter no máximo 2000 caracteres.",
        );
      } else {
        setError("Não foi possível salvar a observação. Tente novamente.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (note: CandidateNote) => {
    setEditingNoteId(note.id);
    setEditText(note.note_text);
  };

  const cancelEdit = () => {
    setEditingNoteId(null);
    setEditText("");
  };

  const saveEdit = async (noteId: string) => {
    if (!candidateId || !editText.trim()) return;
    try {
      setSubmitting(true);
      setError(null);
      const updated = await candidatesService.updateNote(candidateId, noteId, {
        note_text: editText.trim(),
      });
      setNotes((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      cancelEdit();
    } catch (error) {
      if (error instanceof HttpError && error.status === 422) {
        setError(
          typeof error.detail === "string"
            ? error.detail
            : "A observação é obrigatória e deve ter no máximo 2000 caracteres.",
        );
      } else {
        setError("Não foi possível atualizar a observação.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const removeNote = async (noteId: string) => {
    if (!candidateId) return;
    try {
      setDeletingNoteId(noteId);
      setError(null);
      await candidatesService.deleteNote(candidateId, noteId);
      setNotes((prev) => prev.filter((item) => item.id !== noteId));
    } catch {
      setError("Não foi possível remover a observação.");
    } finally {
      setDeletingNoteId(null);
    }
  };

  return (
    <section className="space-y-4 p-5">
      <div className="rounded-xl border border-border/40 bg-surface p-4">
        <p className="text-sm font-semibold text-text">Observações</p>
        <p className="mt-1 text-xs text-text-muted">
          Essas observações são internas e não ficam visíveis para o candidato.
        </p>

        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Escreva uma observação interna sobre este candidato..."
          className="mt-3 min-h-28 w-full rounded-lg border border-border/60 bg-[hsl(var(--bg))] px-3 py-2 text-sm text-text outline-none transition focus:border-[hsl(var(--primary))]/50"
          maxLength={MAX_NOTE_LENGTH}
        />

        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-text-muted">
            {text.length}/{MAX_NOTE_LENGTH}
          </span>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={isSaveDisabled}
            className="rounded-lg bg-[hsl(var(--primary))] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[hsl(var(--primary))]/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Salvando..." : "Salvar observação"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          {error}
        </div>
      ) : null}

      <div className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <LoaderCircle className="h-5 w-5 animate-spin text-[hsl(var(--primary))]" />
          </div>
        ) : notes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-surface p-4 text-sm text-text-muted">
            Nenhuma observação registrada para este candidato.
          </div>
        ) : (
          notes.map((note) => {
            const isEditing = editingNoteId === note.id;
            return (
              <article
                key={note.id}
                className="rounded-xl border border-border/60 bg-surface p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-text">{note.author.name}</p>
                    <p className="text-xs text-text-muted">{formatDateTime(note.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {note.is_edited ? (
                      <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-text-muted">
                        Editada
                      </span>
                    ) : null}
                    {note.is_pinned ? (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">
                        Fixada
                      </span>
                    ) : null}
                    {note.can_edit ? (
                      <button
                        type="button"
                        onClick={() => startEdit(note)}
                        className="rounded-md p-1 text-text-muted transition hover:bg-surface-muted hover:text-text"
                        aria-label="Editar observação"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    ) : null}
                    {note.can_delete ? (
                      <button
                        type="button"
                        onClick={() => void removeNote(note.id)}
                        disabled={deletingNoteId === note.id}
                        className="rounded-md p-1 text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                        aria-label="Excluir observação"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </div>

                {isEditing ? (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={editText}
                      onChange={(event) => setEditText(event.target.value)}
                      className="min-h-24 w-full rounded-lg border border-border/60 bg-[hsl(var(--bg))] px-3 py-2 text-sm text-text outline-none transition focus:border-[hsl(var(--primary))]/50"
                      maxLength={MAX_NOTE_LENGTH}
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="rounded-lg border border-border/70 px-3 py-1.5 text-xs font-semibold text-text-muted"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveEdit(note.id)}
                        disabled={submitting || !editText.trim()}
                        className="rounded-lg bg-[hsl(var(--primary))] px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Salvar
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 whitespace-pre-wrap text-sm text-text">{note.note_text}</p>
                )}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
