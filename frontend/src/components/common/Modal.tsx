import * as Dialog from "@radix-ui/react-dialog";
import React from "react";

type ModalProps = {
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
};

export function Modal({ title, onClose, children }: ModalProps) {
  return (
    <Dialog.Root open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="modal-window card">
          <div className="modal-header">
            <Dialog.Title style={{ margin: 0 }}>{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button className="btn btn-secondary" style={{ padding: "6px 10px" }} aria-label="Fechar">Fechar</button>
            </Dialog.Close>
          </div>
          <Dialog.Description
            style={{
              position: "absolute",
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: "hidden",
              clip: "rect(0, 0, 0, 0)",
              whiteSpace: "nowrap",
              border: 0,
            }}
          >
            {title ? `Conteúdo do modal ${title}` : "Conteúdo do modal"}
          </Dialog.Description>
          <div className="modal-body">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
