import { ChevronDown } from "lucide-react";
import { useState } from "react";

export function ApplicationIntroCard() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between font-semibold text-blue-900"
      >
        <span>ℹ️ Instruções importantes</span>
        <ChevronDown className={`h-5 w-5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <ul className="mt-3 space-y-2 text-sm text-blue-800">
          <li>• Antes de se inscrever, leia o anúncio da vaga</li>
          <li>• Selecione corretamente a vaga desejada</li>
          <li>• Para se candidatar a mais de uma vaga, realize uma nova inscrição</li>
          <li>• Caso não encontre uma vaga de interesse, selecione Banco de Talentos</li>
          <li>• Ao finalizar, aguarde a confirmação de envio</li>
        </ul>
      )}
    </div>
  );
}
