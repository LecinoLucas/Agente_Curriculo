import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, KeyRound, LogOut, ShieldAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useAuth } from "../features/auth/useAuth";
import { isCandidate } from "../shared/auth/roles";
import { authService } from "../services/authService";
import { formatErrorDetails, handleApiError } from "../shared/utils/errorHandler";
import { toast } from "../shared/utils/toast";
import type { UserRole } from "../types/auth";

function postPasswordChangeRoute(role?: UserRole | null): string {
  if (isCandidate(role)) return "/candidato/portal";
  return "/rh";
}

function passwordStrengthLabel(password: string): { label: string; tone: string } {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 1) return { label: "Fraca", tone: "text-red-600" };
  if (score === 2) return { label: "Média", tone: "text-amber-600" };
  return { label: "Forte", tone: "text-emerald-600" };
}

export function ChangePasswordPage() {
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const initiallyForcedRef = useRef(Boolean(user?.must_change_password));

  const isForced = Boolean(user?.must_change_password);
  const strength = useMemo(() => passwordStrengthLabel(newPassword), [newPassword]);

  useEffect(() => {
    if (user?.must_change_password) {
      initiallyForcedRef.current = true;
    }
  }, [user?.must_change_password]);

  useEffect(() => {
    if (initiallyForcedRef.current && user && !user.must_change_password) {
      navigate(postPasswordChangeRoute(user.role), { replace: true });
    }
  }, [navigate, user]);

  function toFriendlyText(caught: unknown): string {
    return formatErrorDetails(handleApiError(caught)).join(" ");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;

    setError(null);

    if (newPassword.length < 8) {
      setError("A nova senha deve ter pelo menos 8 caracteres.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("A confirmação da nova senha não confere.");
      return;
    }

    savingRef.current = true;
    setSaving(true);
    try {
      const updatedUser = await authService.updateMyPassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      updateUser({ ...updatedUser, must_change_password: false });
      toast.success("Senha alterada com sucesso.");
      navigate(postPasswordChangeRoute(updatedUser.role ?? user?.role), { replace: true });
    } catch (err) {
      setError(toFriendlyText(err) || "Falha ao atualizar senha");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 px-6 py-10">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6 rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-900/5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
              <ShieldAlert className="h-3.5 w-3.5" />
              Segurança da conta
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-950">Atualize sua senha</h1>
            <p className="text-sm text-slate-600">
              {isForced
                ? "Seu acesso está temporariamente restrito até que você defina uma nova senha."
                : "Troque sua senha para manter o acesso seguro."}
            </p>
          </div>

          <Button type="button" variant="outline" size="sm" onClick={() => void logout()}>
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start gap-3">
            <KeyRound className="mt-0.5 h-5 w-5 text-blue-600" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-900">Troca obrigatória de senha</p>
              <p className="text-sm text-slate-600">
                Use a senha temporária atual no primeiro campo e defina uma nova senha para liberar a navegação normal.
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <PasswordInput
            label="Senha atual"
            value={currentPassword}
            onChange={setCurrentPassword}
            visible={showCurrent}
            onToggle={() => setShowCurrent((value) => !value)}
            disabled={saving}
          />

          <div className="space-y-2">
            <PasswordInput
              label="Nova senha"
              value={newPassword}
              onChange={setNewPassword}
              visible={showNew}
              onToggle={() => setShowNew((value) => !value)}
              disabled={saving}
            />
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Mínimo de 8 caracteres.</span>
              {newPassword ? <span className={strength.tone}>Força: {strength.label}</span> : null}
            </div>
          </div>

          <PasswordInput
            label="Confirmar nova senha"
            value={confirmPassword}
            onChange={setConfirmPassword}
            visible={showConfirm}
            onToggle={() => setShowConfirm((value) => !value)}
            disabled={saving}
          />

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <Button type="submit" disabled={saving} className="h-11 w-full text-base font-semibold">
            {saving ? "Atualizando..." : "Salvar nova senha"}
          </Button>
        </form>
      </div>
    </div>
  );
}

function PasswordInput({
  label,
  value,
  onChange,
  visible,
  onToggle,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-slate-900">{label}</span>
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3">
        <input
          type={visible ? "text" : "password"}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="h-11 flex-1 bg-transparent text-sm text-slate-900 outline-none disabled:cursor-not-allowed disabled:opacity-70"
        />
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          className="text-slate-500 transition hover:text-slate-800"
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </label>
  );
}
