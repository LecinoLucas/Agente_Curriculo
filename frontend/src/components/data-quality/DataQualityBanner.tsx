/**
 * Banner showing data quality statistics and filtering
 */

import { Alert, AlertDescription } from "@/components/ui/alert";

export interface DataQualityBannerProps {
  filteredCount: number;
  validCount: number;
  unknownCount: number;
  totalCount: number;
}

export function DataQualityBanner({
  filteredCount,
  validCount,
  unknownCount,
  totalCount,
}: DataQualityBannerProps) {
  if (filteredCount === 0) {
    return null;
  }

  const percentage = ((filteredCount / totalCount) * 100).toFixed(0);

  return (
    <Alert className="border-[hsl(var(--warning))] bg-[hsl(var(--warning))]/5">
      <AlertDescription className="text-sm text-[hsl(var(--text))]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="font-semibold">⚠️ {filteredCount} candidatos ocultados</span>
            <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">
              {percentage}% do total possui problemas de dados (sem currículo, parsing falhou, etc).
              Esses candidatos não aparecem no ranking por enquanto.
            </p>
            <div className="mt-2 flex gap-4 text-xs text-[hsl(var(--text-muted))]">
              <span>✅ {validCount} válidos</span>
              <span>❓ {unknownCount} não verificados</span>
              <span>🔴 {filteredCount} com problemas</span>
            </div>
          </div>
        </div>
      </AlertDescription>
    </Alert>
  );
}
