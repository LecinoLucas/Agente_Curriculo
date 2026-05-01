import { AlertCircle, AlertTriangle, Info, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatErrorDetails, type UserFriendlyError } from "../../services/errorHandler";

function severityVariant(error: UserFriendlyError): "destructive" | "warning" | "default" {
  if (error.severity === "warning") return "warning";
  if (error.severity === "info") return "default";
  return "destructive";
}

function SeverityIcon({ severity }: { severity: UserFriendlyError["severity"] }) {
  if (severity === "warning") return <AlertTriangle className="h-4 w-4" />;
  if (severity === "info") return <Info className="h-4 w-4" />;
  return <AlertCircle className="h-4 w-4" />;
}

export function ErrorAlert({ error, onDismiss }: { error: UserFriendlyError; onDismiss?: () => void }) {
  const details = formatErrorDetails(error);

  return (
    <Alert variant={severityVariant(error)} className="relative pr-12">
      <SeverityIcon severity={error.severity} />
      {onDismiss ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onDismiss}
          className="absolute right-2 top-2 h-7 w-7 rounded-full"
          aria-label="Fechar alerta"
        >
          <X className="h-4 w-4" />
        </Button>
      ) : null}
      <AlertTitle>{error.title}</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>{error.message}</p>
        {details.length > 0 ? (
          <ul className="space-y-1">
            {details.map((detail) => (
              <li key={detail} className="list-inside list-disc">
                {detail}
              </li>
            ))}
          </ul>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
