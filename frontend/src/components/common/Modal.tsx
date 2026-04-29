import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type ModalProps = {
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
  contentClassName?: string;
};

export function Modal({ title, onClose, children, contentClassName }: ModalProps) {
  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className={cn("ui-card flex flex-col sm:max-w-[540px]", contentClassName)}>
        <DialogHeader className="shrink-0 border-b border-[hsl(var(--border))] px-6 py-5 pr-12">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">
            {title ? `Conteúdo do modal: ${title}` : "Conteúdo do modal"}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
