import { useMemo, useState } from "react";
import { usersService, ResetUserPasswordPayload } from "../../../services/usersService";
import { formatErrorDetails, handleApiError } from "../../../shared/utils/errorHandler";
import { toast } from "../../../shared/utils/toast";
import { passwordStrength } from "../utils/userFormatters";

const EMPTY_RESET_PASSWORD: ResetUserPasswordPayload = {
  temporary_password: "",
  must_change_password: true,
};

export function useUserPasswordForm(onSuccess: () => Promise<void>) {
  const [resetPasswordForm, setResetPasswordForm] = useState<ResetUserPasswordPayload>(EMPTY_RESET_PASSWORD);
  const [resetPasswordVisible, setResetPasswordVisible] = useState(false);
  const [resetSaving, setResetSaving] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  function toFriendlyText(error: unknown): string {
    return formatErrorDetails(handleApiError(error)).join(" ");
  }

  function reset() {
    setResetPasswordForm(EMPTY_RESET_PASSWORD);
    setResetPasswordVisible(false);
    setResetError(null);
  }

  async function handleResetPassword(userId: string, userName: string) {
    if (resetPasswordForm.temporary_password.length < 8) {
      setResetError("A nova senha temporária deve ter pelo menos 8 caracteres.");
      return;
    }

    const confirmed = window.confirm(
      `Redefinir a senha de ${userName}? A senha atual será substituída.`,
    );
    if (!confirmed) return;

    setResetSaving(true);
    setResetError(null);
    try {
      await usersService.resetPassword(userId, resetPasswordForm);
      toast.success("Senha redefinida com sucesso");
      reset();
      await onSuccess();
    } catch (err) {
      setResetError(toFriendlyText(err) || "Falha ao redefinir senha");
    } finally {
      setResetSaving(false);
    }
  }

  const resetStrength = useMemo(
    () => passwordStrength(resetPasswordForm.temporary_password),
    [resetPasswordForm.temporary_password],
  );

  return {
    resetPasswordForm,
    setResetPasswordForm,
    resetPasswordVisible,
    setResetPasswordVisible,
    resetSaving,
    resetError,
    resetStrength,
    handleResetPassword,
    reset,
  };
}
