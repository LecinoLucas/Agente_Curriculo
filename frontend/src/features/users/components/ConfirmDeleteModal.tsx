import { Modal } from "../../../components/common/Modal";
import { Button } from "@/components/ui/button";

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function ConfirmDeleteModal({ isOpen, onClose, onConfirm }: ConfirmDeleteModalProps) {
  if (!isOpen) return null;

  return (
    <Modal title="Confirmar exclusão" onClose={onClose}>
      <p className="text-sm text-gray-600">
        Tem certeza que deseja excluir este usuário? Esta ação é irreversível.
      </p>
      <div className="flex flex-wrap items-center gap-2 pt-3">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="button" variant="destructive" onClick={() => void onConfirm()}>
          Excluir permanentemente
        </Button>
      </div>
    </Modal>
  );
}
