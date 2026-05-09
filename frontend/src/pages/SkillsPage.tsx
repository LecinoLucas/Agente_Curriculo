import { Plus, Search } from "lucide-react";
import { Modal } from "../components/common/Modal";
import { PageHeader } from "../components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { SkillFormModal } from "../features/skills/components/SkillFormModal";
import { SkillsTable } from "../features/skills/components/SkillsTable";
import { useSkillsPage } from "../features/skills/hooks/useSkillsPage";
import { useSkillForm } from "../features/skills/hooks/useSkillForm";

export function SkillsPage() {
  const { searchQuery, setSearchQuery, loading, error, items, total, hasActiveSearch, isEmptyState, confirmDeleteId, setConfirmDeleteId, handleDelete, reloadList } = useSkillsPage();

  const skillForm = useSkillForm(reloadList);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6 pb-12">
      <PageHeader title="Skills" subtitle="Edite o catálogo canônico de equivalências usado pelo matching" />

      <SkillFormModal
        isOpen={skillForm.showForm}
        isEditing={!!skillForm.editingSkill}
        form={skillForm.form}
        onFormChange={(updates) => skillForm.setForm((f) => ({ ...f, ...updates }))}
        onSubmit={(e) => void skillForm.handleSave(e)}
        onClose={skillForm.closeForm}
        saving={skillForm.saving}
        formError={skillForm.formError}
        onAddAlias={skillForm.handleAddAlias}
        onRemoveAlias={skillForm.handleRemoveAlias}
      />

      {confirmDeleteId ? (
        <Modal title="Confirmar exclusão" onClose={() => setConfirmDeleteId(null)}>
          <p className="text-sm text-[hsl(var(--text-muted))]">
            Tem certeza que deseja excluir esta equivalência do JSON canônico? Esta ação é irreversível.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setConfirmDeleteId(null)}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={() => void handleDelete()}>
              Excluir equivalência
            </Button>
          </div>
        </Modal>
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--text-muted))]" />
            <input
              type="text"
              placeholder="Buscar equivalências..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="ui-input w-full pl-10 text-sm"
            />
          </div>
        </div>
        <Button onClick={skillForm.openCreateForm} className="gap-2">
          <Plus className="h-4 w-4" />
          Nova equivalência
        </Button>
      </div>

      <SkillsTable
        loading={loading}
        error={error}
        items={items}
        total={total}
        hasActiveSearch={hasActiveSearch}
        isEmptyState={isEmptyState}
        onEdit={skillForm.openEditForm}
        onDelete={setConfirmDeleteId}
        onClearSearch={() => setSearchQuery("")}
        onCreateNew={skillForm.openCreateForm}
      />
    </div>
  );
}
