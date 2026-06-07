import { AlertTriangle } from "lucide-react";
import { friendlyWarning } from "../utils/aiAssistantPresenters";

export function AiAssistantWarnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;

  return (
    <div
      className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950/30"
      data-testid="ai-assistant-warnings"
    >
      <div className="mb-2 flex items-center gap-2 text-amber-900 dark:text-amber-200">
        <AlertTriangle className="h-4 w-4" />
        <p className="text-xs font-semibold uppercase tracking-wide">Limitações e avisos</p>
      </div>
      <div className="space-y-2">
        {warnings.map((warning) => (
          <p
            key={warning}
            data-technical-code={warning}
            className="text-xs text-amber-800 dark:text-amber-300"
          >
            {friendlyWarning(warning)}
          </p>
        ))}
      </div>
    </div>
  );
}
