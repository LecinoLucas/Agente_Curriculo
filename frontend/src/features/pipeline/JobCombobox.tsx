import { Briefcase, ChevronDown, MapPin, Search, X } from "lucide-react";
import { KeyboardEvent, useEffect, useRef, useState } from "react";

import type { PipelineJobSummary } from "../../services/pipelineService";
import { formatJobStatus, formatWorkModel, jobStatusTone } from "../../utils/jobFormatters";

interface JobComboboxProps {
  jobs: PipelineJobSummary[];
  loading: boolean;
  value: string | null;
  onChange: (jobId: string) => void;
}

const STATUS_BADGE: Record<string, string> = {
  success:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800",
  warning:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800",
  danger:
    "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800",
  neutral:
    "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
};

export function JobCombobox({ jobs, loading, value, onChange }: JobComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedJob = jobs.find((j) => j.id === value);
  const selectedTone = jobStatusTone(selectedJob?.status ?? "draft");

  const filtered = jobs.filter((j) => {
    const q = query.toLowerCase();
    if (!q) return true;
    return (
      j.title.toLowerCase().includes(q) ||
      formatJobStatus(j.status).toLowerCase().includes(q) ||
      (j.location?.toLowerCase().includes(q) ?? false) ||
      (j.work_model ? formatWorkModel(j.work_model).toLowerCase().includes(q) : false)
    );
  });

  useEffect(() => {
    setHighlighted(0);
  }, [query]);

  useEffect(() => {
    if (open) {
      const id = setTimeout(() => inputRef.current?.focus(), 10);
      return () => clearTimeout(id);
    } else {
      setQuery("");
    }
  }, [open]);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  useEffect(() => {
    const item = listRef.current?.children[highlighted] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [highlighted]);

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlighted]) select(filtered[highlighted].id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  function select(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={containerRef} className="relative w-full min-w-0 sm:w-[300px] md:w-[340px]">
      {/* Trigger */}
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Buscar vaga"
        disabled={loading && jobs.length === 0}
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 w-full items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 text-left shadow-sm outline-none transition hover:border-slate-300 hover:bg-slate-50 focus:border-[hsl(var(--primary))]/35 focus:ring-2 focus:ring-[hsl(var(--primary))]/10 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-800"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
          <Search className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="min-w-0">
              <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                Vaga da pipeline
              </span>
              <span className="block truncate text-sm font-bold tracking-tight text-slate-700 dark:text-slate-100">
                {loading && jobs.length === 0 ? "Carregando vagas…" : (selectedJob?.title ?? "Selecionar vaga")}
              </span>
            </span>
            {selectedJob && (
              <span
                className={`hidden shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold md:inline-flex ${STATUS_BADGE[selectedTone]}`}
              >
                {formatJobStatus(selectedJob.status)}
              </span>
            )}
          </span>
        </span>
        {loading && jobs.length > 0 && (
          <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-slate-500" />
        )}
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-full min-w-[280px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg overflow-hidden">
          {/* Search row */}
          <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Buscar vaga…"
              aria-label="Buscar vaga"
              className="flex-1 bg-transparent text-xs font-medium text-slate-700 dark:text-slate-300 placeholder-slate-400 outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                aria-label="Limpar busca"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* List */}
          <ul ref={listRef} role="listbox" aria-label="Vagas" className="max-h-72 overflow-y-auto py-1">
            {loading && jobs.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-slate-400">Carregando vagas…</li>
            ) : filtered.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-slate-400">Nenhuma vaga encontrada</li>
            ) : (
              filtered.map((job, idx) => {
                const tone = jobStatusTone(job.status);
                const isSelected = job.id === value;
                const isHighlighted = idx === highlighted;
                return (
                  <li
                    key={job.id}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setHighlighted(idx)}
                    onClick={() => select(job.id)}
                    className={`flex cursor-pointer flex-col gap-0.5 px-3 py-2 transition-colors ${
                      isHighlighted ? "bg-slate-50 dark:bg-slate-800/60" : ""
                    } ${isSelected ? "bg-[hsl(var(--primary))]/5" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`truncate text-xs font-bold ${
                          isSelected
                            ? "text-[hsl(var(--primary))]"
                            : "text-slate-700 dark:text-slate-200"
                        }`}
                      >
                        {job.title}
                      </span>
                      <span
                        className={`shrink-0 rounded-full border px-1.5 py-px text-[10px] font-semibold ${STATUS_BADGE[tone]}`}
                      >
                        {formatJobStatus(job.status)}
                      </span>
                    </div>
                    {(job.location ?? job.work_model) && (
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                        {job.location && (
                          <>
                            <MapPin className="h-2.5 w-2.5 shrink-0" />
                            <span className="truncate">{job.location}</span>
                          </>
                        )}
                        {job.location && job.work_model && <span>·</span>}
                        {job.work_model && (
                          <>
                            <Briefcase className="h-2.5 w-2.5 shrink-0" />
                            <span>{formatWorkModel(job.work_model)}</span>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
