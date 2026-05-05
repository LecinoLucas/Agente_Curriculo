import { UserCog, ShieldCheck } from "lucide-react";
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
import { CreateUserPayload } from "../../../services/usersService";

interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  form: CreateUserPayload;
  onFormChange: (form: CreateUserPayload) => void;
  saving: boolean;
  error: string | null;
  passwordVisible: boolean;
  onTogglePasswordVisibility: () => void;
  strength: { label: "—" | "fraca" | "média" | "forte"; score: 0 | 1 | 2 | 3 };
  onSubmit: (event: React.FormEvent) => void;
}

export function CreateUserModal({
  isOpen,
  onClose,
  form,
  onFormChange,
  saving,
  error,
  passwordVisible,
  onTogglePasswordVisibility,
  strength,
  onSubmit,
}: CreateUserModalProps) {
  if (!isOpen) return null;

  return (
    <Modal
      title="Novo usuário interno"
      onClose={onClose}
      contentClassName="sm:max-w-[760px] max-h-[85vh] overflow-y-auto"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <SectionCard
          title="Informações do usuário"
          description="Dados básicos da conta interna. Nenhuma senha salva é exibida nessa tela."
          icon={<UserCog className="h-4 w-4" />}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Nome">
              <input
                required
                value={form.full_name}
                onChange={(event) => onFormChange({ ...form, full_name: event.target.value })}
                placeholder="Nome completo"
                className={inputCls}
              />
            </FormField>
            <FormField label="E-mail">
              <input
                required
                type="email"
                value={form.email}
                onChange={(event) => onFormChange({ ...form, email: event.target.value })}
                placeholder="email@empresa.com"
                className={inputCls}
              />
            </FormField>
            <FormField label="Perfil/tipo de usuário">
              <select
                value={form.role}
                onChange={(event) => onFormChange({ ...form, role: event.target.value })}
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
                value={form.is_active ? "active" : "inactive"}
                onChange={(event) => onFormChange({ ...form, is_active: event.target.value === "active" })}
                className={selectCls}
              >
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
              </select>
            </FormField>
          </div>
        </SectionCard>

        <SectionCard
          title="Segurança e acesso"
          description="A senha temporária só pode ser visualizada enquanto está sendo criada."
          icon={<ShieldCheck className="h-4 w-4" />}
        >
          <PasswordField
            label="Senha temporária"
            value={form.temporary_password}
            onChange={(value) => onFormChange({ ...form, temporary_password: value })}
            visible={passwordVisible}
            onToggleVisibility={onTogglePasswordVisibility}
            onGenerate={() => {
              const password = buildStrongPassword();
              onFormChange({ ...form, temporary_password: password });
              onTogglePasswordVisibility();
              void copyPassword(password);
            }}
            onCopy={() => void copyPassword(form.temporary_password)}
            copyDisabled={!form.temporary_password}
            generateLabel="Gerar senha forte"
          />

          <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
            <input
              type="checkbox"
              checked={form.must_change_password}
              onChange={(event) => onFormChange({ ...form, must_change_password: event.target.checked })}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <p className="text-sm font-medium text-gray-900">Forçar troca de senha no próximo login</p>
              <p className="text-xs text-gray-500">
                Quando marcado, o usuário só poderá navegar normalmente depois de definir uma nova senha.
              </p>
            </div>
          </label>

          {form.temporary_password ? (
            <div className="text-xs text-gray-500">
              Força atual da senha: <span className="font-semibold uppercase text-gray-700">{strength.label}</span>
            </div>
          ) : null}
        </SectionCard>

        {error ? <InlineError message={error} /> : null}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button type="submit" disabled={saving}>
            {saving ? "Criando..." : "Criar usuário"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
