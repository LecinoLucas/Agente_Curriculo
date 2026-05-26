import React from "react";
import { Sparkles } from "lucide-react";

type CandidatePublicShellProps = {
  eyebrow?: string;
  title: string | React.ReactNode;
  subtitle?: string;
  children: React.ReactNode;
  topAction?: React.ReactNode;
  maxWidth?: "md" | "lg" | "xl" | "2xl" | "3xl";
  contentClassName?: string;
  cardClassName?: string;
  hideHeader?: boolean;
};

export function CandidatePublicShell({
  eyebrow,
  title,
  subtitle,
  children,
  topAction,
  maxWidth = "md",
  contentClassName = "",
  cardClassName = "",
  hideHeader = false,
}: CandidatePublicShellProps) {
  const widthClasses = {
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
    "3xl": "max-w-3xl",
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#FDFBF7] dark:bg-[hsl(var(--bg))] px-4 py-8 sm:px-6 lg:px-8 flex flex-col justify-center items-center">
      {/* Background decoration */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.25] dark:opacity-[0.08]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, hsl(var(--primary)/0.12) 1px, transparent 0)`,
          backgroundSize: "24px 24px",
        }}
      />
      <div className="pointer-events-none absolute left-[-15%] top-[-15%] h-[35rem] w-[35rem] rounded-full bg-[hsl(var(--primary)/0.04)] blur-[100px] animate-pulse" />
      <div className="pointer-events-none absolute right-[-10%] bottom-[-15%] h-[30rem] w-[30rem] rounded-full bg-[hsl(var(--brand-glow)/0.06)] blur-[95px]" />

      <div className={`relative w-full ${widthClasses[maxWidth]} z-10 flex flex-col items-center ${contentClassName}`}>
        
        {/* Top Action Button */}
        {topAction && (
          <div className="absolute right-0 -top-2 z-20">
            {topAction}
          </div>
        )}

        {/* Brand Header */}
        {!hideHeader && (
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-base font-black text-white shadow-xs">
                RA
              </span>
              <div className="flex flex-col text-left">
                <span className="font-heading text-sm font-black leading-none tracking-tight text-foreground">
                  Marajó RH
                </span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1 font-bold">
                  ATS & Recrutamento IA
                </span>
              </div>
            </div>

            {eyebrow && (
              <div className="mb-2.5 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-primary shadow-xs">
                <Sparkles className="h-3 w-3" />
                {eyebrow}
              </div>
            )}

            <h1 className="font-heading text-2xl sm:text-3xl font-black tracking-tight text-foreground leading-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1.5 max-w-md text-xs sm:text-sm font-semibold text-muted-foreground leading-relaxed">
                {subtitle}
              </p>
            )}
          </div>
        )}

        {/* Central Content */}
        <div className={`w-full ${cardClassName}`}>
          {children}
        </div>

        {/* Footer */}
        <footer className="mt-8 text-center text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">
          © {new Date().getFullYear()} Marajó RH IA System. Todos os direitos reservados.
        </footer>
      </div>
    </div>
  );
}
