import type { ReactNode } from "react";

interface CandidateDrawerOverlayProps {
  isOpen: boolean;
  mode: "overlay" | "workspace";
  children: ReactNode;
  onBackdropClick?: () => void;
}

export function CandidateDrawerOverlay({
  isOpen,
  mode,
  children,
  onBackdropClick,
}: CandidateDrawerOverlayProps) {
  if (mode === "workspace") {
    if (!isOpen) return null;

    return (
      <div
        role="complementary"
        aria-label="Painel do candidato"
        className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[hsl(var(--surface))]"
      >
        {children}
      </div>
    );
  }

  return (
    <>
      {isOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={onBackdropClick}
          aria-hidden="true"
        />
      ) : null}

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Painel do candidato"
        className={[
          "fixed inset-y-0 right-0 z-50 flex w-[520px] max-w-full flex-col bg-[hsl(var(--surface))] shadow-2xl",
          mode === "overlay" ? "overflow-y-auto" : "overflow-hidden",
          "transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        {children}
      </div>
    </>
  );
}
