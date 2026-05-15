import { ChevronDown, Info } from "lucide-react";
import { useState } from "react";

export function ApplicationIntroCard() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mb-8 overflow-hidden rounded-3xl border border-[hsl(var(--primary)/0.15)] bg-[hsl(var(--primary)/0.03)] backdrop-blur-sm transition-all duration-300">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between p-5 text-left font-bold text-[hsl(var(--primary))]"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]">
            <Info className="h-4 w-4" />
          </div>
          <span className="text-sm tracking-tight sm:text-base">Instruções importantes</span>
        </div>
        <div className={`flex h-8 w-8 items-center justify-center rounded-full transition-all hover:bg-[hsl(var(--primary)/0.1)] ${isOpen ? "rotate-180" : ""}`}>
          <ChevronDown className="h-5 w-5" />
        </div>
      </button>

      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"}`}>
        <ul className="space-y-3 px-5 pb-6 text-sm font-medium leading-relaxed text-[hsl(var(--text-muted))]">
          <li className="flex gap-3">
            <span className="text-[hsl(var(--primary))] font-bold">•</span>
            Antes de se inscrever, leia o anúncio da vaga
          </li>
          <li className="flex gap-3">
            <span className="text-[hsl(var(--primary))] font-bold">•</span>
            Selecione corretamente a vaga desejada
          </li>
          <li className="flex gap-3">
            <span className="text-[hsl(var(--primary))] font-bold">•</span>
            Para se candidatar a mais de uma vaga, realize uma nova inscrição
          </li>
          <li className="flex gap-3">
            <span className="text-[hsl(var(--primary))] font-bold">•</span>
            Caso não encontre uma vaga de interesse, selecione Banco de Talentos
          </li>
          <li className="flex gap-3">
            <span className="text-[hsl(var(--primary))] font-bold">•</span>
            Ao finalizar, aguarde a confirmação de envio
          </li>
        </ul>
      </div>
    </div>
  );
}
