/**
 * Filter toggle for showing/hiding data quality issues
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";

export interface DataQualityFilterProps {
  invalidCount: number;
  onToggle: (showInvalid: boolean) => void;
  defaultShowInvalid?: boolean;
}

export function DataQualityFilter({
  invalidCount,
  onToggle,
  defaultShowInvalid = false,
}: DataQualityFilterProps) {
  const [showInvalid, setShowInvalid] = useState(defaultShowInvalid);

  if (invalidCount === 0) {
    return null;
  }

  const handleToggle = () => {
    const newValue = !showInvalid;
    setShowInvalid(newValue);
    onToggle(newValue);
  };

  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/30 p-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-sm text-[hsl(var(--text))]">
          <strong>{invalidCount}</strong> candidato{invalidCount !== 1 ? "s" : ""} ocultado
          {invalidCount !== 1 ? "s" : ""} por problemas de dados
        </span>
      </div>
      <Button
        variant={showInvalid ? "default" : "outline"}
        size="sm"
        onClick={handleToggle}
        className="text-xs"
      >
        {showInvalid ? "Ocultando problemas" : "Mostrar tudo"}
      </Button>
    </div>
  );
}
