import { AlertCircle, CheckCircle2, Inbox, Loader2, Mail } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { communicationService } from "../../../services/communicationService";
import type { CandidateCommunication } from "../../../types/domain";

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export interface CandidateMessagesCardProps {
  refreshTrigger?: number;
}

export function CandidateMessagesCard({ refreshTrigger = 0 }: CandidateMessagesCardProps) {
  const [messages, setMessages] = useState<CandidateCommunication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const displayedMessages = showAll ? messages : messages.slice(0, 2);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await communicationService.getCandidateCommunications();
      const uniqueMessages = Array.from(
        new Map(payload.communications.map((m) => [m.id, m])).values()
      ).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setMessages(uniqueMessages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar suas mensagens.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages, refreshTrigger]);

  const handleMarkRead = async (messageId: string) => {
    setMarkingId(messageId);
    setError(null);
    try {
      await communicationService.markCommunicationRead(messageId);
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? { ...message, status: "read", read_at: new Date().toISOString() }
            : message,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível marcar a mensagem como lida.");
    } finally {
      setMarkingId(null);
    }
  };

  return (
    <Card className="overflow-hidden border border-[#eae6e2] rounded-[1.25rem] bg-white shadow-sm transition-all duration-300">
      <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#5c061a]/5 text-[#5c061a]">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              Mensagens
              {messages.length > 0 && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#5c061a]/10 text-[11px] font-black text-[#5c061a]">
                  {messages.length}
                </span>
              )}
            </CardTitle>
          </div>
        </div>
        {messages.length > 2 && (
          <button
            onClick={() => setShowAll((prev) => !prev)}
            className="text-xs font-bold text-[#5c061a] hover:underline"
          >
            {showAll ? "Ver menos" : "Ver todas"}
          </button>
        )}
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 rounded-2xl border border-slate-100 p-5 text-xs font-semibold text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin text-[#5c061a]" />
            Carregando mensagens...
          </div>
        ) : null}

        {error ? (
          <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {!loading && !error && messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-100 py-10 text-center">
            <Inbox className="h-10 w-10 text-slate-300" />
            <div>
              <p className="text-sm font-semibold text-slate-500">
                Nenhuma mensagem no momento.
              </p>
              <p className="text-[11px] text-slate-400 font-semibold mt-1">
                Quando houver atualização, ela aparecerá aqui.
              </p>
            </div>
          </div>
        ) : null}

        {!loading && messages.length > 0 ? (
          <div className="space-y-4">
            {displayedMessages.map((message) => (
              <article
                key={message.id}
                className="group relative flex items-start gap-4 pb-4 last:pb-0 border-b border-slate-100 last:border-0"
              >
                <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#5c061a] text-white text-xs font-extrabold shadow-sm">
                  MR
                  {message.status !== "read" && (
                    <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white animate-pulse" />
                  )}
                </div>

                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-slate-800">
                        {message.subject || "Marajó RH"}
                      </p>
                      {message.status === "read" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-700">
                          Lida
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#5c061a]/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#5c061a]">
                          Nova
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-medium text-slate-400">
                      {formatDateTime(message.created_at)}
                    </span>
                  </div>

                  <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">
                    {message.body}
                  </p>

                  {message.status !== "read" && (
                    <div className="mt-2.5 flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={markingId === message.id}
                        onClick={() => void handleMarkRead(message.id)}
                        className="h-8 text-xs font-bold text-slate-700 hover:text-slate-900 border-slate-200 rounded-lg transition-colors duration-200"
                      >
                        {markingId === message.id ? (
                          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        ) : null}
                        Marcar como lida
                      </Button>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {messages.length > 2 && (
          <div className="pt-3 border-t border-slate-100 flex justify-center">
            <button
              onClick={() => setShowAll((prev) => !prev)}
              className="inline-flex items-center gap-1 text-xs font-bold text-[#5c061a] hover:underline"
            >
              {showAll ? "Ver menos mensagens" : "Ver todas as mensagens →"}
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
