import type { ReactNode } from "react";

type AdmissionSectionCardProps = {
  title: string;
  eyebrow?: string;
  description?: string;
  children: ReactNode;
  /** Optional content rendered at the right side of the card header (e.g. "Ver todos" link) */
  headerRight?: ReactNode;
  actions?: ReactNode;
  id?: string;
};

export function AdmissionSectionCard({
  title,
  eyebrow,
  description,
  children,
  headerRight,
  actions,
  id,
}: AdmissionSectionCardProps) {
  return (
    <section id={id} className="admission-section-card">
      <div className="p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-0.5">
            {eyebrow ? (
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--text-muted))]">
                {eyebrow}
              </p>
            ) : null}
            <h2 className="text-base font-semibold tracking-normal text-[hsl(var(--text))]">
              {title}
            </h2>
            {description ? (
              <p className="max-w-2xl text-sm text-[hsl(var(--text-muted))]">
                {description}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {headerRight}
            {actions}
          </div>
        </div>
        {children}
      </div>
    </section>
  );
}
