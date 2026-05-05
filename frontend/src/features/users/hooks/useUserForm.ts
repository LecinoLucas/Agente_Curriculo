import { useMemo, useState } from "react";
import {
  usersService,
  CreateUserPayload,
  PatchUserPayload,
} from "../../../services/usersService";
import { formatErrorDetails, handleApiError } from "../../../shared/utils/errorHandler";
import { toast } from "../../../shared/utils/toast";
import { UserSummary } from "../../../types/domain";
import { passwordStrength } from "../utils/userFormatters";

const EMPTY_CREATE: CreateUserPayload = {
  email: "",
  temporary_password: "",
  full_name: "",
  role: "recruiter",
  is_active: true,
  must_change_password: true,
};

export function useUserForm(onSuccess: () => Promise<void>) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState<CreateUserPayload>(EMPTY_CREATE);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createPasswordVisible, setCreatePasswordVisible] = useState(false);

  const [editingUser, setEditingUser] = useState<UserSummary | null>(null);
  const [editForm, setEditForm] = useState<PatchUserPayload>({});
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  function toFriendlyText(error: unknown): string {
    return formatErrorDetails(handleApiError(error)).join(" ");
  }

  function openCreateModal() {
    setShowCreateForm(true);
    setCreateForm(EMPTY_CREATE);
    setCreatePasswordVisible(false);
    setCreateError(null);
  }

  function closeCreateModal() {
    setShowCreateForm(false);
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
  }

  function closeEditModal() {
    setEditingUser(null);
    setEditForm({});
    setEditError(null);
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
      closeCreateModal();
      await onSuccess();
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
      await onSuccess();
    } catch (err) {
      setEditError(toFriendlyText(err) || "Falha ao atualizar usuário");
    } finally {
      setEditSaving(false);
    }
  }

  const createStrength = useMemo(
    () => passwordStrength(createForm.temporary_password),
    [createForm.temporary_password],
  );

  return {
    // Create modal
    showCreateForm,
    openCreateModal,
    closeCreateModal,
    createForm,
    setCreateForm,
    createSaving,
    createError,
    createPasswordVisible,
    setCreatePasswordVisible,
    createStrength,
    handleCreate,
    // Edit modal
    editingUser,
    openEditModal,
    closeEditModal,
    editForm,
    setEditForm,
    editSaving,
    editError,
    handleEdit,
  };
}
