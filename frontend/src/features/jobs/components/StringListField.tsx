import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface StringListFieldProps {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  addLabel: string;
  emptyLabel: string;
  inputLabel: string;
  testId: string;
}

/**
 * Reusable tag-style list editor for string lists (mandatory_skills,
 * nice_to_have_skills, screening_questions, benefits).
 *
 * Visually consistent with the existing behavioral_requirements editor.
 * Normalization: trims, drops empties, dedupes case-insensitively on add.
 */
export function StringListField({
  values,
  onChange,
  placeholder,
  addLabel,
  emptyLabel,
  inputLabel,
  testId,
}: StringListFieldProps) {
  const [draft, setDraft] = useState("");

  function handleAdd() {
    const cleaned = draft.trim();
    if (!cleaned) return;
    const key = cleaned.toLocaleLowerCase("pt-BR");
    const exists = values.some((v) => v.trim().toLocaleLowerCase("pt-BR") === key);
    if (exists) {
      setDraft("");
      return;
    }
    onChange([...values, cleaned]);
    setDraft("");
  }

  function handleRemove(item: string) {
    onChange(values.filter((v) => v !== item));
  }

  return (
    <div className="space-y-3" data-testid={testId}>
      <div className="flex flex-col gap-3 md:flex-row">
        <input
          aria-label={inputLabel}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleAdd();
            }
          }}
          className="bg-surface border border-border text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring h-11 flex-1 rounded-xl px-3 text-sm"
          placeholder={placeholder}
          data-testid={`${testId}-input`}
        />
        <Button
          type="button"
          onClick={handleAdd}
          disabled={!draft.trim()}
          data-testid={`${testId}-add-btn`}
        >
          {addLabel}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {values.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => handleRemove(item)}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-muted px-3 py-2 text-xs text-text"
            aria-label={`Remover ${item}`}
            data-testid={`${testId}-item`}
          >
            {item}
            <Trash2 className="h-3.5 w-3.5 text-text-muted" />
          </button>
        ))}
        {values.length === 0 && (
          <p className="text-sm text-text-muted">{emptyLabel}</p>
        )}
      </div>
    </div>
  );
}
