import { CheckCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../../../components/ui/button";
import type { ApplyResponse } from "../types";

interface Props {
  response: ApplyResponse;
  onNewApplication: () => void;
}

export function SuccessScreen({ response, onNewApplication }: Props) {
  const statusMessage = response.talent_pool
    ? "Sua inscrição no Banco de Talentos foi recebida."
    : response.analysis_auto_requested
      ? "Sua candidatura foi recebida e seu currículo entrou em análise."
      : "Sua candidatura foi recebida com sucesso.";

  return (
    <div className="flex flex-col items-center justify-center gap-6 rounded-lg bg-green-50 p-8 text-center">
      <CheckCircle className="h-16 w-16 text-green-600" />

      <div>
        <h2 className="text-2xl font-bold text-green-900">Candidatura enviada com sucesso!</h2>
        <p className="mt-2 text-green-800">{statusMessage}</p>
      </div>

      {response.job_id && (
        <div className="rounded-lg bg-white p-3 text-sm text-gray-700">
          <p className="font-medium">Candidatura registrada para:</p>
          <p className="text-gray-900">Vaga publicada</p>
        </div>
      )}

      {!response.job_id && (
        <div className="rounded-lg bg-white p-3 text-sm text-gray-700">
          <p className="font-medium">Status:</p>
          <p className="text-gray-900">Seu currículo foi registrado no Banco de Talentos</p>
        </div>
      )}

      {response.portal_access_hint ? (
        <p className="max-w-md text-sm text-green-800">{response.portal_access_hint}</p>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <Button asChild>
          <Link to="/candidato">Acompanhar candidatura</Link>
        </Button>
        <Button variant="outline" onClick={onNewApplication}>
          Fazer outra candidatura
        </Button>
      </div>
    </div>
  );
}
