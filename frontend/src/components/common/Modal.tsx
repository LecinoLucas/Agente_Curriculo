import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type ModalProps = {
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
  contentClassName?: string;
};

export function Modal({ title, onClose, children, contentClassName }: ModalProps) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        aria-label="Fechar modal"
        className="absolute inset-0 cursor-default bg-black/55 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title ?? "Conteúdo do modal"}
        className={cn(
          "relative z-[1001] flex max-h-[90vh] w-full flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl shadow-black/30",
          "sm:max-w-[540px]",
          contentClassName,
        )}
      >
        <div className="shrink-0 border-b border-border px-6 py-5 pr-12">
          <h2 className="text-lg font-semibold leading-none tracking-tight font-display text-text">
            {title}
          </h2>
          <p className="sr-only">
            {title ? `Conteúdo do modal: ${title}` : "Conteúdo do modal"}
          </p>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-sm text-text-muted transition hover:text-text focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/30"
          aria-label="Fechar modal"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>,
    document.body,
  );
}
