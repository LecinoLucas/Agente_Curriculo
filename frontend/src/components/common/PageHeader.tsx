import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  subtitle: string;
  actions?: ReactNode;
};

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-gray-950">{title}</h2>
        <p className="text-sm text-gray-500">{subtitle}</p>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
