import { ReactNode } from "react";

interface CandidateProfileContentProps {
  children: ReactNode;
  isLoading?: boolean;
}

export function CandidateProfileContent({
  children,
  isLoading = false,
}: CandidateProfileContentProps) {
  return (
    <div className="flex-1 overflow-y-auto bg-[hsl(var(--bg))]">
      {isLoading ? (
        <div className="p-6">
          <div className="animate-pulse space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-[hsl(var(--surface-muted))]/40" />
            ))}
          </div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
