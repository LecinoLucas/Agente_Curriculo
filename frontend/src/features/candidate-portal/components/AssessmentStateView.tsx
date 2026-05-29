import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Loader2,
} from "lucide-react";
import type { ReactNode } from "react";

import type { AssessmentDisplayState } from "../utils/assessmentState";

interface StateConfig {
  icon: ReactNode;
  title: string;
  description: string;
  iconColor: string;
}

const STATE_CONFIG: Record<AssessmentDisplayState, StateConfig> = {
  not_required: {
    icon: <ClipboardList className="h-6 w-6" />,
    title: "Sem avaliação obrigatória",
    description: "Esta vaga não possui avaliação obrigatória no momento.",
    iconColor: "text-muted-foreground/50",
  },
  pending_release: {
    icon: <Clock className="h-6 w-6" />,
    title: "Aguardando liberação",
    description:
      "A avaliação ainda não foi liberada pelo time de recrutamento. Quando estiver disponível, você poderá responder por aqui.",
    iconColor: "text-amber-500",
  },
  available: {
    icon: <ClipboardCheck className="h-6 w-6" />,
    title: "Avaliação disponível",
    description:
      "Sua avaliação está disponível. Responda com atenção para continuar no processo.",
    iconColor: "text-primary",
  },
  submitted: {
    icon: <CheckCircle2 className="h-6 w-6" />,
    title: "Respostas recebidas",
    description:
      "Recebemos suas respostas. Agora o time de recrutamento irá analisar sua avaliação.",
    iconColor: "text-emerald-600",
  },
  under_review: {
    icon: <Loader2 className="h-6 w-6 animate-spin" />,
    title: "Em análise",
    description: "Sua avaliação está sendo analisada pelo time responsável.",
    iconColor: "text-blue-500",
  },
  completed: {
    icon: <CheckCircle2 className="h-6 w-6" />,
    title: "Avaliação concluída",
    description:
      "Sua avaliação foi concluída. Continue acompanhando o andamento da candidatura por aqui.",
    iconColor: "text-emerald-600",
  },
  error: {
    icon: <AlertCircle className="h-6 w-6" />,
    title: "Indisponível",
    description:
      "Não foi possível carregar sua avaliação agora. Tente novamente mais tarde.",
    iconColor: "text-red-500",
  },
};

export function AssessmentStateView({
  state,
  onStart,
  startLoading,
}: {
  state: AssessmentDisplayState;
  onStart?: () => void;
  startLoading?: boolean;
}) {
  const config = STATE_CONFIG[state];
  return (
    <div
      data-testid="assessment-state-view"
      data-state={state}
      className="flex flex-col items-center justify-center py-10 text-center gap-4 rounded-2xl border-2 border-dashed border-border"
    >
      <div className={config.iconColor}>{config.icon}</div>
      <div className="space-y-1 px-4">
        <p className="text-sm font-semibold text-foreground">{config.title}</p>
        <p className="text-xs text-muted-foreground max-w-xs mx-auto">
          {config.description}
        </p>
      </div>
      {state === "available" && onStart ? (
        <button
          type="button"
          onClick={onStart}
          disabled={startLoading}
          className="inline-flex h-9 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {startLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Responder avaliação
        </button>
      ) : null}
    </div>
  );
}
