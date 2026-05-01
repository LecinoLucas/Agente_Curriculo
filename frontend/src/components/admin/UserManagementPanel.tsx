import { useEffect, useMemo, useState } from "react";
import { Copy, Eye, EyeOff, KeyRound, RefreshCw, ShieldCheck, UserCog } from "lucide-react";

import { ActionMenu } from "../common/ActionMenu";
import { CrudPage } from "../common/CrudPage";
import { Modal } from "../common/Modal";
import {
  usersService,
  CreateUserPayload,
  PatchUserPayload,
  ResetUserPasswordPayload,
} from "../../services/usersService";
import { formatErrorDetails, formatErrorForToast, handleApiError } from "../../services/errorHandler";
import { toast } from "../../services/toast";
import { Paginated } from "../../types/api";
import { UserSummary } from "../../types/domain";
import { UserRole, UserStatus } from "../../types/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ROLES: UserRole[] = ["admin", "recruiter", "viewer", "candidate"];
const INTERNAL_ROLES: UserRole[] = ["admin", "recruiter", "viewer"];
const STATUSES: UserStatus[] = ["active", "pending_verification", "suspended", "inactive"];

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  recruiter: "Recrutador",
  candidate: "Candidato",
  viewer: "Leitor",
};

const ROLE_CLASS: Record<string, string> = {
  admin: "bg-indigo-50 text-indigo-700 border-indigo-200",
  recruiter: "bg-purple-50 text-purple-700 border-purple-200",
  viewer: "bg-gray-100 text-gray-600 border-gray-200",
  candidate: "bg-amber-50 text-amber-700 border-amber-200",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Ativo",
  pending_verification: "Aguardando validação",
  suspended: "Suspenso",
  inactive: "Inativo",
};

const STATUS_CLASS: Record<string, string> = {
  active: "bg-green-50 text-green-700 border-green-200",
  pending_verification: "bg-amber-50 text-amber-700 border-amber-200",
  suspended: "bg-red-50 text-red-700 border-red-200",
  inactive: "bg-gray-100 text-gray-500 border-gray-200",
};

const inputCls =
  "h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100";

const selectCls =
  "h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100";

const filterSelectCls =
  "h-9 rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100";

const EMPTY_CREATE: CreateUserPayload = {
  email: "",
  temporary_password: "",
  full_name: "",
  role: "recruiter",
  is_active: true,
  must_change_password: true,
};

const EMPTY_RESET_PASSWORD: ResetUserPasswordPayload = {
  temporary_password: "",
  must_change_password: true,
};

type UserManagementPanelProps = {
  showSummaryCards?: boolean;
};

function RoleBadge({ role }: { role: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        ROLE_CLASS[role] ?? "bg-gray-100 text-gray-600 border-gray-200",
      )}
    >
      {ROLE_LABEL[role] ?? role}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        STATUS_CLASS[status] ?? "bg-gray-100 text-gray-500 border-gray-200",
      )}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function Initials({ name }: { name: string }) {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-bold text-white">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

function buildStrongPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%&*?";
  const all = `${upper}${lower}${digits}${symbols}`;
  const picks = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    symbols[Math.floor(Math.random() * symbols.length)],
  ];

  while (picks.length < 14) {
    picks.push(all[Math.floor(Math.random() * all.length)]);
  }

  return picks
    .sort(() => Math.random() - 0.5)
    .join("");
}

function passwordStrength(password: string): { label: "—" | "fraca" | "média" | "forte"; score: 0 | 1 | 2 | 3 } {
  if (!password) return { label: "—", score: 0 };
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 1) return { label: "fraca", score: 1 };
  if (score === 2) return { label: "média", score: 2 };
  return { label: "forte", score: 3 };
}

function strengthTone(score: number): string {
  if (score === 1) return "bg-red-500";
  if (score === 2) return "bg-amber-500";
  return "bg-emerald-500";
}

function FormField({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-900 dark:text-gray-100">
      {label}
      {children}
      {hint ? <span className="text-xs text-gray-500">{hint}</span> : null}
    </label>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <span className="font-bold">!</span>
      <span>{message}</span>
    </div>
  );
}

function SectionCard({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4">
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-xl bg-white p-2 text-blue-600 shadow-sm">{icon}</div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function PasswordField({
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

export function UserManagementPanel({ showSummaryCards = true }: UserManagementPanelProps) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [data, setData] = useState<Paginated<UserSummary> | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState<CreateUserPayload>(EMPTY_CREATE);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createPasswordVisible, setCreatePasswordVisible] = useState(false);

  const [editingUser, setEditingUser] = useState<UserSummary | null>(null);
  const [editForm, setEditForm] = useState<PatchUserPayload>({});
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [resetPasswordForm, setResetPasswordForm] = useState<ResetUserPasswordPayload>(EMPTY_RESET_PASSWORD);
  const [resetPasswordVisible, setResetPasswordVisible] = useState(false);
  const [resetSaving, setResetSaving] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function toFriendlyText(error: unknown): string {
    return formatErrorDetails(handleApiError(error)).join(" ");
  }

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      setData(
        await usersService.list(
          page,
          20,
          search || undefined,
          roleFilter || undefined,
          statusFilter || undefined,
        ),
      );
    } catch (err) {
      setLoadError(toFriendlyText(err) || "Falha ao carregar usuários");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [page, search, roleFilter, statusFilter]);

  function handleSearchSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput);
  }

  function clearFilters() {
    setSearch("");
    setSearchInput("");
    setRoleFilter("");
    setStatusFilter("");
    setPage(1);
  }

  function openCreateModal() {
    setShowCreateForm(true);
    setCreateForm(EMPTY_CREATE);
    setCreatePasswordVisible(false);
    setCreateError(null);
  }

  function openEditModal(user: UserSummary) {
    setEditingUser(user);
    setEditForm({
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      is_active: user.status === "active",
    });
    setEditError(null);
    setResetPasswordForm({
      temporary_password: "",
      must_change_password: true,
    });
    setResetPasswordVisible(false);
    setResetError(null);
  }

  async function copyPassword(value: string) {
    if (!value) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();

        const copied = document.execCommand("copy");
        document.body.removeChild(textarea);

        if (!copied) {
          throw new Error("copy_failed");
        }
      }
      toast.success("Senha copiada");
    } catch {
      toast.error("Não foi possível copiar a senha");
    }
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setCreateSaving(true);
    setCreateError(null);

    if (createForm.temporary_password.length < 8) {
      setCreateError("A senha temporária deve ter pelo menos 8 caracteres.");
      setCreateSaving(false);
      return;
    }

    try {
      const created = await usersService.create(createForm);
      toast.success(`Usuário criado: ${created.full_name}`);
      setShowCreateForm(false);
      setCreateForm(EMPTY_CREATE);
      setPage(1);
      await load();
    } catch (err) {
      setCreateError(toFriendlyText(err) || "Falha ao criar usuário");
    } finally {
      setCreateSaving(false);
    }
  }

  async function handleEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!editingUser) return;

    const payload: PatchUserPayload = {};
    if (editForm.email && editForm.email !== editingUser.email) payload.email = editForm.email;
    if (editForm.full_name && editForm.full_name !== editingUser.full_name) payload.full_name = editForm.full_name;
    if (editForm.role && editForm.role !== editingUser.role) payload.role = editForm.role;

    const currentIsActive = editingUser.status === "active";
    if (typeof editForm.is_active === "boolean" && editForm.is_active !== currentIsActive) {
      payload.is_active = editForm.is_active;
    }

    if (Object.keys(payload).length === 0) {
      setEditError("Nenhuma alteração detectada.");
      return;
    }

    setEditSaving(true);
    setEditError(null);
    try {
      const updated = await usersService.patch(editingUser.id, payload);
      toast.success(`Usuário atualizado: ${updated.full_name}`);
      setEditingUser(updated);
      setEditForm({
        email: updated.email,
        full_name: updated.full_name,
        role: updated.role,
        is_active: updated.status === "active",
      });
      await load();
    } catch (err) {
      setEditError(toFriendlyText(err) || "Falha ao atualizar usuário");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleResetPassword() {
    if (!editingUser) return;
    if (resetPasswordForm.temporary_password.length < 8) {
      setResetError("A nova senha temporária deve ter pelo menos 8 caracteres.");
      return;
    }

    const confirmed = window.confirm(
      `Redefinir a senha de ${editingUser.full_name}? A senha atual será substituída.`,
    );
    if (!confirmed) return;

    setResetSaving(true);
    setResetError(null);
    try {
      await usersService.resetPassword(editingUser.id, resetPasswordForm);
      toast.success("Senha redefinida com sucesso");
      setResetPasswordForm(EMPTY_RESET_PASSWORD);
      setResetPasswordVisible(false);
      await load();
    } catch (err) {
      setResetError(toFriendlyText(err) || "Falha ao redefinir senha");
    } finally {
      setResetSaving(false);
    }
  }

  async function handleActivate(id: string) {
    try {
      await usersService.activate(id);
      toast.success("Usuário ativado");
      await load();
    } catch (err) {
      toast.error(formatErrorForToast(handleApiError(err)));
    }
  }

  async function handleDeactivate(id: string) {
    try {
      await usersService.deactivate(id);
      toast.success("Usuário desativado");
      await load();
    } catch (err) {
      toast.error(formatErrorForToast(handleApiError(err)));
    }
  }

  async function handleDelete() {
    if (!confirmDeleteId) return;
    const user = data?.data.find((item) => item.id === confirmDeleteId);
    try {
      await usersService.delete(confirmDeleteId);
      toast.success(`Usuário "${user?.full_name ?? ""}" excluído`);
      setConfirmDeleteId(null);
      await load();
    } catch (err) {
      toast.error(formatErrorForToast(handleApiError(err)));
      setConfirmDeleteId(null);
    }
  }

  const total = data?.total ?? 0;
  const totalPages = data?.total_pages ?? 1;
  const items = data?.data ?? [];
  const hasFilters = !!(search || roleFilter || statusFilter);

  const activeCount = items.filter((user) => user.status === "active").length;
  const adminCount = items.filter((user) => user.role === "admin").length;
  const pendingPasswordCount = items.filter((user) => user.must_change_password).length;

  const createStrength = useMemo(
    () => passwordStrength(createForm.temporary_password),
    [createForm.temporary_password],
  );

  const resetStrength = useMemo(
    () => passwordStrength(resetPasswordForm.temporary_password),
    [resetPasswordForm.temporary_password],
  );

  return (
    <div className="space-y-6">
      {showSummaryCards ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryCard label="Total de usuários" value={total} />
          <SummaryCard label="Ativos nesta página" value={activeCount} />
          <SummaryCard label="Troca obrigatória pendente" value={pendingPasswordCount} />
        </div>
      ) : null}

      {showCreateForm ? (
        <Modal
          title="Novo usuário interno"
          onClose={() => setShowCreateForm(false)}
          contentClassName="sm:max-w-[760px] max-h-[85vh] overflow-y-auto"
        >
          <form onSubmit={(event) => void handleCreate(event)} className="space-y-4">
            <SectionCard
              title="Informações do usuário"
              description="Dados básicos da conta interna. Nenhuma senha salva é exibida nessa tela."
              icon={<UserCog className="h-4 w-4" />}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Nome">
                  <input
                    required
                    value={createForm.full_name}
                    onChange={(event) => setCreateForm((current) => ({ ...current, full_name: event.target.value }))}
                    placeholder="Nome completo"
                    className={inputCls}
                  />
                </FormField>
                <FormField label="E-mail">
                  <input
                    required
                    type="email"
                    value={createForm.email}
                    onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))}
                    placeholder="email@empresa.com"
                    className={inputCls}
                  />
                </FormField>
                <FormField label="Perfil/tipo de usuário">
                  <select
                    value={createForm.role}
                    onChange={(event) => setCreateForm((current) => ({ ...current, role: event.target.value }))}
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
                    value={createForm.is_active ? "active" : "inactive"}
                    onChange={(event) => setCreateForm((current) => ({ ...current, is_active: event.target.value === "active" }))}
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
                value={createForm.temporary_password}
                onChange={(value) => setCreateForm((current) => ({ ...current, temporary_password: value }))}
                visible={createPasswordVisible}
                onToggleVisibility={() => setCreatePasswordVisible((value) => !value)}
                onGenerate={() => {
                  const password = buildStrongPassword();
                  setCreateForm((current) => ({ ...current, temporary_password: password }));
                  setCreatePasswordVisible(true);
                  void copyPassword(password);
                }}
                onCopy={() => void copyPassword(createForm.temporary_password)}
                copyDisabled={!createForm.temporary_password}
                generateLabel="Gerar senha forte"
              />

              <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
                <input
                  type="checkbox"
                  checked={createForm.must_change_password}
                  onChange={(event) => setCreateForm((current) => ({ ...current, must_change_password: event.target.checked }))}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">Forçar troca de senha no próximo login</p>
                  <p className="text-xs text-gray-500">
                    Quando marcado, o usuário só poderá navegar normalmente depois de definir uma nova senha.
                  </p>
                </div>
              </label>

              {createForm.temporary_password ? (
                <div className="text-xs text-gray-500">
                  Força atual da senha: <span className="font-semibold uppercase text-gray-700">{createStrength.label}</span>
                </div>
              ) : null}
            </SectionCard>

            {createError ? <InlineError message={createError} /> : null}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button type="submit" disabled={createSaving}>
                {createSaving ? "Criando..." : "Criar usuário"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowCreateForm(false)} disabled={createSaving}>
                Cancelar
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {editingUser ? (
        <Modal
          title={`Gerenciar usuário: ${editingUser.full_name}`}
          onClose={() => setEditingUser(null)}
          contentClassName="sm:max-w-[760px] max-h-[85vh] overflow-y-auto"
        >
          <div className="space-y-4">
            <form onSubmit={(event) => void handleEdit(event)} className="space-y-4">
              <SectionCard
                title="Informações do usuário"
                description="Salvar esta seção não altera nenhuma senha existente."
                icon={<UserCog className="h-4 w-4" />}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Nome">
                    <input
                      value={editForm.full_name ?? ""}
                      onChange={(event) => setEditForm((current) => ({ ...current, full_name: event.target.value }))}
                      className={inputCls}
                    />
                  </FormField>
                  <FormField label="E-mail">
                    <input
                      type="email"
                      value={editForm.email ?? ""}
                      onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))}
                      className={inputCls}
                    />
                  </FormField>
                  <FormField label="Perfil/tipo de usuário">
                    <select
                      value={editForm.role ?? editingUser.role}
                      onChange={(event) => setEditForm((current) => ({ ...current, role: event.target.value }))}
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
                      value={(editForm.is_active ?? (editingUser.status === "active")) ? "active" : "inactive"}
                      onChange={(event) => setEditForm((current) => ({ ...current, is_active: event.target.value === "active" }))}
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
                onChange={(value) => setResetPasswordForm((current) => ({ ...current, temporary_password: value }))}
                visible={resetPasswordVisible}
                onToggleVisibility={() => setResetPasswordVisible((value) => !value)}
                onGenerate={() => {
                  const password = buildStrongPassword();
                  setResetPasswordForm((current) => ({ ...current, temporary_password: password }));
                  setResetPasswordVisible(true);
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
                  onChange={(event) => setResetPasswordForm((current) => ({ ...current, must_change_password: event.target.checked }))}
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
                <Button type="button" onClick={() => void handleResetPassword()} disabled={resetSaving}>
                  {resetSaving ? "Redefinindo..." : "Redefinir senha"}
                </Button>
              </div>
            </SectionCard>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditingUser(null)} disabled={editSaving || resetSaving}>
                Fechar
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {confirmDeleteId ? (
        <Modal title="Confirmar exclusão" onClose={() => setConfirmDeleteId(null)}>
          <p className="text-sm text-gray-600">
            Tem certeza que deseja excluir este usuário? Esta ação é irreversível.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-3">
            <Button type="button" variant="outline" onClick={() => setConfirmDeleteId(null)}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={() => void handleDelete()}>
              Excluir permanentemente
            </Button>
          </div>
        </Modal>
      ) : null}

      <CrudPage<UserSummary>
        onNew={openCreateModal}
        newLabel="Novo usuário"
        searchInput={searchInput}
        onSearchInputChange={setSearchInput}
        onSearchSubmit={handleSearchSubmit}
        onSearchClear={hasFilters ? clearFilters : undefined}
        searchPlaceholder="Buscar por nome ou e-mail..."
        filters={
          <>
            <select
              value={roleFilter}
              onChange={(event) => {
                setRoleFilter(event.target.value);
                setPage(1);
              }}
              className={filterSelectCls}
            >
              <option value="">Todos os perfis</option>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABEL[role]}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setPage(1);
              }}
              className={filterSelectCls}
            >
              <option value="">Todos os status</option>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABEL[status]}
                </option>
              ))}
            </select>
          </>
        }
        loading={loading}
        error={loadError}
        count={total}
        isEmpty={!loading && !loadError && items.length === 0}
        emptyIcon="🔐"
        emptyTitle="Nenhum usuário encontrado"
        emptyDescription={
          hasFilters
            ? "Nenhuma conta corresponde aos filtros aplicados."
            : "Crie os primeiros acessos para distribuir perfis e começar a operação."
        }
        emptyAction={
          hasFilters
            ? { label: "Limpar filtros", onClick: clearFilters }
            : { label: "+ Novo usuário", onClick: openCreateModal }
        }
        columns={[
          "Usuário",
          { header: "Perfil", className: "w-36" },
          { header: "Status", className: "w-40" },
          { header: "Segurança", className: "w-44 hidden lg:table-cell" },
          { header: "Último acesso", className: "w-32 hidden xl:table-cell" },
          { header: "Ações", className: "w-20 text-right" },
        ]}
        items={items}
        renderRow={(user) => (
          <tr
            key={user.id}
            className="border-b border-gray-100 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50"
          >
            <td className="px-4 py-3">
              <div className="flex items-center gap-3">
                <Initials name={user.full_name} />
                <div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{user.full_name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{user.email}</div>
                </div>
              </div>
            </td>

            <td className="px-4 py-3">
              <RoleBadge role={user.role} />
            </td>

            <td className="px-4 py-3">
              <StatusBadge status={user.status} />
            </td>

            <td className="hidden px-4 py-3 lg:table-cell">
              {user.must_change_password ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Troca obrigatória
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Acesso regular
                </span>
              )}
            </td>

            <td className="hidden px-4 py-3 text-sm text-gray-500 xl:table-cell">
              {formatDate(user.last_login_at)}
            </td>

            <td className="px-4 py-3 text-right">
              <ActionMenu
                buttonLabel={`Ações de ${user.full_name}`}
                items={[
                  { label: "Editar usuário", onClick: () => openEditModal(user) },
                  user.status !== "active"
                    ? { label: "Ativar conta", onClick: () => void handleActivate(user.id) }
                    : { label: "Desativar conta", onClick: () => void handleDeactivate(user.id) },
                  { label: "Excluir", tone: "danger", onClick: () => setConfirmDeleteId(user.id) },
                ]}
              />
            </td>
          </tr>
        )}
        footer={
          total > 0 ? (
            <div className="flex w-full items-center justify-between">
              <span className="text-sm text-gray-500">
                Página {page} de {totalPages} · {total} {total === 1 ? "usuário" : "usuários"}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                >
                  Anterior
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={page >= totalPages}
                >
                  Próxima
                </Button>
              </div>
            </div>
          ) : undefined
        }
      />
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</div>
    </div>
  );
}
