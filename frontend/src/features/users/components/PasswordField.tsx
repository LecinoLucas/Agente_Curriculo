import { Copy, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { passwordStrength, strengthTone } from "../utils/userFormatters";
import { FormField } from "./FormField";

export function PasswordField({
  label,
  value,
  onChange,
  visible,
  onToggleVisibility,
  onGenerate,
  onCopy,
  copyDisabled,
  generateLabel = "Gerar senha forte",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggleVisibility: () => void;
  onGenerate: () => void;
  onCopy: () => void;
  copyDisabled?: boolean;
  generateLabel?: string;
}) {
  const strength = passwordStrength(value);

  return (
    <div className="space-y-2">
      <FormField label={label} hint="Mínimo de 8 caracteres.">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center rounded-md border border-gray-200 bg-white px-3">
              <input
                type={visible ? "text" : "password"}
                minLength={8}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder="Digite a senha temporária"
                className="h-10 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
              />
              <button
                type="button"
                onClick={onToggleVisibility}
                className="text-gray-500 transition hover:text-gray-800"
                aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
              >
                {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <Button type="button" variant="outline" onClick={onGenerate}>
              {generateLabel}
            </Button>
            <Button type="button" variant="outline" onClick={onCopy} disabled={copyDisabled}>
              <Copy className="mr-2 h-4 w-4" />
              Copiar
            </Button>
          </div>

          <div className="space-y-1">
            <div className="flex gap-1">
              {[1, 2, 3].map((step) => (
                <span
                  key={step}
                  className={cn(
                    "h-2 flex-1 rounded-full bg-gray-200",
                    value && step <= strength.score ? strengthTone(strength.score) : undefined,
                  )}
                />
              ))}
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Força da senha</span>
              <span className="font-medium uppercase text-gray-700">{strength.label}</span>
            </div>
          </div>
        </div>
      </FormField>
    </div>
  );
}
