import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { CandidateOverview } from "../../types/domain";
import { candidatesService } from "../../services/candidatesService";
import { toast } from "../../services/toast";

interface EditCandidateModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidate: CandidateOverview["candidate"] | undefined;
  onSuccess: () => void;
}

export function EditCandidateModal({ isOpen, onClose, candidate, onSuccess }: EditCandidateModalProps) {
  const [fullName, setFullName] = useState(candidate?.full_name ?? "");
  const [email, setEmail] = useState(candidate?.email ?? "");
  const [phone, setPhone] = useState(candidate?.phone ?? "");
  const [cpf, setCpf] = useState(candidate?.cpf ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !candidate) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      // Validations
      if (!fullName.trim()) {
        setError("Nome é obrigatório");
        setSaving(false);
        return;
      }
      if (!email.trim()) {
        setError("E-mail é obrigatório");
        setSaving(false);
        return;
      }
      if (cpf && cpf.replace(/\D/g, "").length !== 11) {
        setError("CPF deve conter 11 dígitos");
        setSaving(false);
        return;
      }

      await candidatesService.update(candidate.id, {
        full_name: fullName,
        email,
        phone: phone || null,
        cpf: cpf || null,
      });

      toast.success("Dados atualizados com sucesso");
      onSuccess();
      onClose();
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes("409") || err.message.includes("já existe")) {
          setError("Já existe outro candidato com este email ou CPF");
        } else {
          setError(err.message || "Não foi possível atualizar os dados");
        }
      } else {
        setError("Não foi possível atualizar os dados");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity ${isOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Editar dados do candidato
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Atualize as informações cadastrais
          </p>
        </div>

        {/* Content */}
        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-1 flex-col overflow-y-auto p-6">
          <div className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Nome */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Nome completo *
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ex: João Silva"
                className="mt-2 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                E-mail *
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Ex: joao@example.com"
                className="mt-2 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>

            {/* Telefone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Telefone
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Ex: (11) 99999-9999"
                className="mt-2 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>

            {/* CPF */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                CPF
              </label>
              <input
                type="text"
                value={cpf}
                onChange={(e) => setCpf(e.target.value.replace(/\D/g, "").slice(0, 11))}
                placeholder="Ex: 12345678901"
                maxLength={11}
                className="mt-2 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Apenas dígitos, 11 números
              </p>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-700 dark:bg-gray-800/50">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={saving}
            className="flex-1"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            onClick={(e) => {
              const form = (e.target as HTMLElement).closest("form");
              if (form) {
                const event = new Event("submit", { bubbles: true });
                form.dispatchEvent(event);
              }
            }}
            disabled={saving}
            className="flex-1"
          >
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
