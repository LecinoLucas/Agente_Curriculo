import type { ReactNode } from "react";

type AdmissionSectionCardProps = {
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  id?: string;
};

export function AdmissionSectionCard({
  eyebrow,
  title,
  description,
  children,
  actions,
  id,
}: AdmissionSectionCardProps) {
  return (
    <section id={id} className="admission-section-card">
      <div className="p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--text-muted))]">
              {eyebrow}
            </p>
            <h2 className="text-base font-semibold tracking-normal text-[hsl(var(--text))]">
              {title}
            </h2>
            {description ? (
              <p className="max-w-2xl text-sm text-[hsl(var(--text-muted))]">
                {description}
              </p>
            ) : null}
          </div>
          {actions}
        </div>
        {children}
      </div>
    </section>
  );
}
