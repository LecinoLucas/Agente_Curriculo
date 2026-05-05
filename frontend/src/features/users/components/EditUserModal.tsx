import { UserCog, KeyRound } from "lucide-react";
import { Modal } from "../../../components/common/Modal";
import { Button } from "@/components/ui/button";
import {
  INTERNAL_ROLES,
  ROLE_LABEL,
  inputCls,
  selectCls,
  copyPassword,
  buildStrongPassword,
} from "../utils/userFormatters";
import { SectionCard } from "../../../shared/components/layout/SectionCard";
import { FormField } from "./FormField";
import { PasswordField } from "./PasswordField";
import { InlineError } from "./InlineError";
import { UserSummary } from "../../../types/domain";
import { PatchUserPayload, ResetUserPasswordPayload } from "../../../services/usersService";

interface EditUserModalProps {
  user: UserSummary | null;
  onClose: () => void;
  editForm: PatchUserPayload;
  onEditFormChange: (form: PatchUserPayload) => void;
  editSaving: boolean;
  editError: string | null;
  onEditSubmit: (event: React.FormEvent) => void;
  resetPasswordForm: ResetUserPasswordPayload;
  onResetPasswordFormChange: (form: ResetUserPasswordPayload) => void;
  resetPasswordVisible: boolean;
  onToggleResetPasswordVisibility: () => void;
  resetSaving: boolean;
  resetError: string | null;
  resetStrength: { label: "—" | "fraca" | "média" | "forte"; score: 0 | 1 | 2 | 3 };
  onResetPasswordSubmit: () => Promise<void>;
}

export function EditUserModal({
  user,
  onClose,
  editForm,
  onEditFormChange,
  editSaving,
  editError,
  onEditSubmit,
  resetPasswordForm,
  onResetPasswordFormChange,
  resetPasswordVisible,
  onToggleResetPasswordVisibility,
  resetSaving,
  resetError,
  resetStrength,
  onResetPasswordSubmit,
}: EditUserModalProps) {
  if (!user) return null;

  return (
    <Modal
      title={`Gerenciar usuário: ${user.full_name}`}
      onClose={onClose}
      contentClassName="sm:max-w-[760px] max-h-[85vh] overflow-y-auto"
    >
      <div className="space-y-4">
        <form onSubmit={onEditSubmit} className="space-y-4">
          <SectionCard
            title="Informações do usuário"
            description="Salvar esta seção não altera nenhuma senha existente."
            icon={<UserCog className="h-4 w-4" />}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Nome">
                <input
                  value={editForm.full_name ?? ""}
                  onChange={(event) => onEditFormChange({ ...editForm, full_name: event.target.value })}
                  className={inputCls}
                />
              </FormField>
              <FormField label="E-mail">
                <input
                  type="email"
                  value={editForm.email ?? ""}
                  onChange={(event) => onEditFormChange({ ...editForm, email: event.target.value })}
                  className={inputCls}
                />
              </FormField>
              <FormField label="Perfil/tipo de usuário">
                <select
                  value={editForm.role ?? user.role}
                  onChange={(event) => onEditFormChange({ ...editForm, role: event.target.value })}
                  className={selectCls}
                >
                  {INTERNAL_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABEL[role]}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Status">
                <select
                  value={(editForm.is_active ?? (user.status === "active")) ? "active" : "inactive"}
                  onChange={(event) => onEditFormChange({ ...editForm, is_active: event.target.value === "active" })}
                  className={selectCls}
                >
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                </select>
              </FormField>
            </div>

            {editError ? <InlineError message={editError} /> : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={editSaving}>
                {editSaving ? "Salvando..." : "Salvar alterações"}
              </Button>
            </div>
          </SectionCard>
        </form>

        <SectionCard
          title="Redefinir senha"
          description="A senha atual nunca é exibida. A redefinição é uma ação separada da edição do usuário."
          icon={<KeyRound className="h-4 w-4" />}
        >
          <PasswordField
            label="Nova senha temporária"
            value={resetPasswordForm.temporary_password}
            onChange={(value) => onResetPasswordFormChange({ ...resetPasswordForm, temporary_password: value })}
            visible={resetPasswordVisible}
            onToggleVisibility={onToggleResetPasswordVisibility}
            onGenerate={() => {
              const password = buildStrongPassword();
              onResetPasswordFormChange({ ...resetPasswordForm, temporary_password: password });
              onToggleResetPasswordVisibility();
              void copyPassword(password);
            }}
            onCopy={() => void copyPassword(resetPasswordForm.temporary_password)}
            copyDisabled={!resetPasswordForm.temporary_password}
            generateLabel="Gerar nova senha"
          />

          <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
            <input
              type="checkbox"
              checked={resetPasswordForm.must_change_password}
              onChange={(event) =>
                onResetPasswordFormChange({ ...resetPasswordForm, must_change_password: event.target.checked })
              }
              className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <p className="text-sm font-medium text-gray-900">Forçar troca de senha no próximo login</p>
              <p className="text-xs text-gray-500">
                Recomendado quando a senha foi gerada por um administrador ou enviada como credencial temporária.
              </p>
            </div>
          </label>

          {resetPasswordForm.temporary_password ? (
            <div className="text-xs text-gray-500">
              Força atual da senha: <span className="font-semibold uppercase text-gray-700">{resetStrength.label}</span>
            </div>
          ) : null}

          {resetError ? <InlineError message={resetError} /> : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => void onResetPasswordSubmit()} disabled={resetSaving}>
              {resetSaving ? "Redefinindo..." : "Redefinir senha"}
            </Button>
          </div>
        </SectionCard>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={editSaving || resetSaving}>
            Fechar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
